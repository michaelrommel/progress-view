'use strict';

import tty from 'tty';
import chalk from 'chalk';
import sparkly from 'sparkly';
import { sprintf } from 'sprintf-js';
import ansiEscapes from 'ansi-escapes';
import termSize from 'term-size';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

function ProgressView () {
  // safeguard against being called without new
  if (!(this instanceof ProgressView)) {
    return new ProgressView();
  }

  // instance variables
  this._preservePreviousScreen = false;
  this._statsHeight = 3;
  this._progressValue = 0;
  this._progressValMax = 50;
  this._statsConfig = [];
  this._screen = { columns: 80, rows: 24 };

  // fix 'this' in callback function scopes
  const that = this;

  // Internal functions
  this._initScreen = function initScreen (config) {
    process.stdout.write(ansiEscapes.cursorHide);
    //determine the needed stats area height by looking at the stats data struct
    that._statsHeight = config.statsConfig.length;
    // if we revert the screen, remember the old screen
    that._preservePreviousScreen = config.preservePreviousScreen || false;
    if (that._preservePreviousScreen) {
      process.stdout.write(ansiEscapes.smcup);
    }
    process.stdout.write(ansiEscapes.eraseScreen);
    that._screen = termSize();
    if (that._screen.rows < (that._statsHeight + 9)) {
      // screen too small
      process.stdout.write('Screen is vertically too small.\n');
      process.exit(1);
    }
    process.stdout.write(ansiEscapes.setRegion(0, that._screen.rows - that._statsHeight - 5));
    process.stdout.write(ansiEscapes.cursorTo(0, 0));
    process.stdout.on('resize', that._resizeScreen);
  }

  this._resetScreen = function resetScreen (overrideScreenRestore) {
    process.stdout.write(ansiEscapes.clearRegion);
    process.stdout.write(ansiEscapes.cursorShow);
    process.stdout.write(ansiEscapes.cursorTo(0, that._screen.rows));
    process.stdout.write(ansiEscapes.scrollUp);
    process.stdout.write('\n');
    if (overrideScreenRestore === undefined || !overrideScreenRestore) {
      if (that._preservePreviousScreen) {
        // if initialized with "preserve" restore the remembered screen
        process.stdout.write(ansiEscapes.rmcup);
      }
    }
  }

  this._resizeScreen = function resizeScreen () {
    that._screen = termSize();
    if (that._screen.rows < (that._statsHeight + 9)) {
      // screen too small
      process.stdout.write('Screen is vertically too small.\n');
      // process.exit(1);
      // TODO: set a flag and suppress the stats and progress display
    }
    process.stdout.write(ansiEscapes.clearRegion);
    process.stdout.write(ansiEscapes.cursorTo(0, 0));
    process.stdout.write(ansiEscapes.eraseScreen);
    process.stdout.write(ansiEscapes.setRegion(0, that._screen.rows - that._statsHeight - 5));
    that._redrawProgress();
    that._recalculatePix();
    that._redrawStatistics();
    that._updateProgress();
    that._updateStatistics();
  }

  this._initProgress = function initProgress (config) {
    that._progressType = config.progressType || 'PERCENTAGE';
    that._progressValMax = config.progressValMax || 100;
    that._progressDigits = that._progressValMax.toString().length;
    that._progressValue = config.progressValue || 0;
    that._progressColour = config.progressColour || chalk.greenBright;
    that._progressBackground = config.progressBackground || chalk.bgBlack;
    that._progressSymbol = config.progressSymbol || '=';
    that._progressHeader = config.progressHeader || 'Progress';
    that._redrawProgress(0);
  }

  this._setProgressMax = function setProgressMax (valOrPromise) {
    if (valOrPromise && (valOrPromise instanceof Promise)) {
      // we received a promise, show pending bar animation
      let barVal = -1;
      let direction = -1;
      function animateBar () {
        that._updateProgress(barVal);
        barVal += direction;
        if (barVal < -90 || barVal > -2) {
          direction *= -1;
        }
      }
      const pbi = setInterval(animateBar, 20);
      valOrPromise
      .then((maxDocuments) => {
        clearInterval(pbi);
        that._progressValMax = maxDocuments;
        that._progressDigits = that._progressValMax.toString().length;
        that._progressValue = 0;
        that._updateProgress(that._progressValue);
        return maxDocuments;
      })
      .catch((err) => {
        clearInterval(pbi);
        debug(`Error while getting max Documents: ${err}`);
        return 0;
      });
      return valOrPromise;
    } else {
      that._progressValMax = valOrPromise || 100;
      that._progressDigits = that._progressValMax.toString().length;
      that._updateProgress();
    }
  }

  this._redrawProgress = function redrawProgress (value) {
    // display the area separator
    process.stdout.write(ansiEscapes.cursorSavePosition);
    process.stdout.write(ansiEscapes.cursorTo(0, that._screen.rows - that._statsHeight - 4));
    const leftbar = BARHORIZ.repeat((that._screen.columns - 10) / 2)
    const rightbar = BARHORIZ.repeat(that._screen.columns - 10 - leftbar.length);
    const progressSeparator = leftbar + ' Progress ' + rightbar;
    process.stdout.write(progressSeparator);
    process.stdout.write(ansiEscapes.cursorRestorePosition);
    // initialize the complete bar
    that._updateProgress(value);
  }

  this._updateProgress = function updateProgress (value) {
    // if the value is negative, display an oscillating bar fragment
    if (value < 0) {
      // update value, if one is given
      if (value) that._progressValue = value;
      // how long can the progressbar be?
      let trailer = 'calculating...';
      that._progressDigits = trailer.length;
      const barMax = that._screen.columns - that._progressHeader.length - trailer.length - 4;
      // fragment shall be 10% of overall length
      const barFragment = Math.round(0.1 * barMax);
      let barFront = Math.round(-1 * (that._progressValue + 1) * barMax / 100);
      if (barFront + barFragment > barMax) barFront = barMax - barFragment;
      const barBack = Math.round(barMax - barFragment - barFront);
      // display the bar
      process.stdout.write(ansiEscapes.cursorSavePosition);
      process.stdout.write(ansiEscapes.cursorTo(0, that._screen.rows - that._statsHeight - 3));
      const barLine = ' ' +
        that._progressHeader + ' ' +
        that._progressBackground(that._progressSymbol.repeat(barFront)) +
        that._progressColour(that._progressSymbol.repeat(barFragment)) +
        that._progressBackground(that._progressSymbol.repeat(barBack)) + ' ' +
        trailer;
      process.stdout.write(barLine);
      process.stdout.write(ansiEscapes.cursorRestorePosition);
    } else {
      // update value, if one is given
      if (value) that._progressValue = value;
      if (value > that._progressValMax) value = that._progressValMax;
      // how long can the progressbar be?
      const trailer = that._progressType === 'NUMBER'
        ? sprintf(`%${that._progressDigits}d/%d`, that._progressValue, that._progressValMax)
        : sprintf(`%3d/100%%`, that._progressValue);
      const barMax = that._screen.columns - that._progressHeader.length - trailer.length - 4;
      const barNow = that._progressType === 'NUMBER'
        ? Math.round(that._progressValue / that._progressValMax * barMax)
        : Math.round(that._progressValue / 100 * barMax );
      // display the bar
      process.stdout.write(ansiEscapes.cursorSavePosition);
      process.stdout.write(ansiEscapes.cursorTo(0, that._screen.rows - that._statsHeight - 3));
      const barLine = ' ' +
        that._progressHeader + ' ' +
        that._progressColour(that._progressSymbol.repeat(barNow)) +
        that._progressBackground(that._progressSymbol.repeat(barMax - barNow)) + ' ' +
        trailer;
      process.stdout.write(barLine);
      process.stdout.write(ansiEscapes.cursorRestorePosition);
    }
  }

  // designed to show a statistics object, like the following:
  //     read: 000009363    3082 reads/s
  //    write: 000000000       0 writes/s
  //     sync: 000009363    1698 syncs/sec
  //  q_reads: 000000000
  // q_writes: 000000000
  // with sparklines and gauges. It should contain an array of lines
  // each array consists of an array of objects with
  //   name=xxx, val=nnn, digits=nn,
  //   style=(NONE|SPARK|GAUGE), colour=chalk_colour
  this._initStatistics = function initStatistics (config) {
    // determine the layout
    for (let line of config.statsConfig) {
      let no_of_sparks = 0;
      let no_of_gauges = 0;
      let len_of_labels = 0;
      let len_of_values = 0;
      let no_of_values = line.length;
      let len_of_graphics = 0;
      for (let field of line) {
        len_of_labels += field.name.length + 1;
        len_of_values += field.digits + 2;
        if (field.style === 'SPARK') {
          no_of_sparks++;
          // create empty history array
          field.history = [];
        } else if (field.style === 'GAUGE') {
          no_of_gauges++;
          // create placeholder for max value
          field.max = 0;
          // calculate place for max value
          len_of_labels += field.name.length + 6;
        }
      }
      len_of_graphics =
        (that._screen.columns - 4 - len_of_labels - len_of_values)
        / (no_of_sparks + no_of_gauges);
      that._statsConfig.push([
        { sparks: no_of_sparks, gauges: no_of_gauges,
          len_labels: len_of_labels, len_values: len_of_values,
          pix: len_of_graphics },
        ...line
      ]);
    }
    that._redrawStatistics();
  }

  this._recalculatePix = function recalculatePix () {
    // recalculate the length of the sparklines and gauges
    for (let i = 0; i < that._statsConfig.length; i++ ) {
      const {
        sparks: no_of_sparks, gauges: no_of_gauges,
        len_labels: len_of_labels, len_values: len_of_values,
        pix: len_of_graphics
      } = that._statsConfig[i][0];
      const new_pixlen =
        (that._screen.columns - 4 - len_of_labels - len_of_values)
        / (no_of_sparks + no_of_gauges);
      that._statsConfig[i][0].pix = new_pixlen;
    }
  }

  this._redrawStatistics = function redrawStatistics () {
    // display the area separator
    process.stdout.write(ansiEscapes.cursorSavePosition);
    process.stdout.write(ansiEscapes.cursorTo(0, that._screen.rows - that._statsHeight - 2));
    const leftbar = BARHORIZ.repeat((that._screen.columns - 14) / 2);
    const rightbar = BARHORIZ.repeat(that._screen.columns - 14 - leftbar.length);
    const statsTop = RCORNERTL + leftbar + ' Statistics ' + rightbar + RCORNERTR;
    process.stdout.write(statsTop);
    // box borders
    for (let i = 1; i <= that._statsConfig.length; i++) {
      process.stdout.write(ansiEscapes.cursorTo(0,
        that._screen.rows - that._statsHeight - 2 + i));
      process.stdout.write(BARVERTI);
      process.stdout.write(ansiEscapes.cursorTo(that._screen.columns,
        that._screen.rows - that._statsHeight - 2 + i));
      process.stdout.write(BARVERTI);
    }
    // bottom border
    process.stdout.write(ansiEscapes.cursorTo(0, that._screen.rows));
    const statsBottom = RCORNERBL
      + BARHORIZ.repeat(that._screen.columns - 2)
      + RCORNERBR;
    process.stdout.write(statsBottom);
    process.stdout.write(ansiEscapes.cursorRestorePosition);
    // initialize the complete bar
    that._updateStatistics();
  }

  this._updateStatistics = function updateStatistics (value) {
    // display each line
    process.stdout.write(ansiEscapes.cursorSavePosition);
    for (let i = 0; i < that._statsConfig.length; i++) {
      const confline = that._statsConfig[i];
      process.stdout.write(ansiEscapes.cursorTo(2,
        that._screen.rows - that._statsHeight - 1 + i));
      const lineconfig = confline[0];
      for (let j = 1; j < confline.length; j++) {
        // print the label
        process.stdout.write(`${that._statsConfig[i][j].name} `);
        let val;
        if (value && value[i] && value[i][j-1]) {
          // use the provided value
          val = value[i][j-1].val;
          if (confline[j].style === 'SPARK') {
            // store it in the history
            let histlen = that._statsConfig[i][j].history.push(val);
            if (histlen > lineconfig.pix) {
              // remove history items longer than there is space for display
              that._statsConfig[i][j].history.splice(0, histlen-lineconfig.pix);
            }
          } else if (confline[j].style === 'GAUGE') {
            // store max value encountered
            if (that._statsConfig[i][j].max < val) {
              that._statsConfig[i][j].max = val;
            }
          }
        } else {
          val = 0;
          if (confline[j].style === 'SPARK') {
            // still need to check, whether the screen became smaller and
            // recalculate history
            let histlen = that._statsConfig[i][j].history.length;
            if (histlen > lineconfig.pix) {
              // remove history items longer than there is space for display
              that._statsConfig[i][j].history.splice(0, histlen-lineconfig.pix);
            }
          }
        };
        // print the value
        if (confline[j].style === 'GAUGE') {
          process.stdout.write(sprintf(
            `%${that._statsConfig[i][j].digits}d max: %${that._statsConfig[i][j].digits}d  `,
            val, that._statsConfig[i][j].max
          ));
        } else {
          process.stdout.write(sprintf(`%${that._statsConfig[i][j].digits}d  `, val));
        }
        // print graphics
        if (confline[j].style === 'SPARK') {
          let sparkline = sparkly(
            that._statsConfig[i][j].history
          );
          process.stdout.write(sparkline + ' ');
        } else if (confline[j].style === 'GAUGE') {
          let max = that._statsConfig[i][j].max;
          let barlen = Math.round(lineconfig.pix / max * val);
          let blanklen = lineconfig.pix - barlen;
          let gauge = confline[j].colour(' '.repeat(barlen));
          let blank = chalk.bgBlack(' '.repeat(blanklen));
          process.stdout.write(gauge + blank + ' ');
        }
      }
    }
    process.stdout.write(ansiEscapes.cursorRestorePosition);
  }
}

ProgressView.prototype.init = function init (config, done) {
  // call all initialization functions
  this._initScreen(config);
  this._initProgress(config);
  this._initStatistics(config);
  if (done) {
    setImmediate(done);
  }
  return this;
};

ProgressView.prototype.reset = function reset (overrideScreenRestore) {
  this._resetScreen(overrideScreenRestore);
};

ProgressView.prototype.setProgressMax = function setProgressMax (value) {
  return this._setProgressMax(value);
};

ProgressView.prototype.updateProgress = function updateProgress (value) {
  this._updateProgress(value);
};

ProgressView.prototype.updateStatistics = function updateStatistics (value) {
  this._updateStatistics(value);
};

// box drawing characters
const BARHORIZ = '\u2500';
const BARVERTI = '\u2502';
const CORNERTL = '\u250C';
const CORNERTR = '\u2510';
const CORNERBL = '\u2514';
const CORNERBR = '\u2518';
const RCORNERTL = '\u256D';
const RCORNERTR = '\u256E';
const RCORNERBL = '\u2570';
const RCORNERBR = '\u256F';

// additional ansiEscapes function addition
const ESC = '\u001B[';
ansiEscapes.smcup = ESC + '?1049h';
ansiEscapes.rmcup = ESC + '?1049l';
ansiEscapes.clearRegion = ESC + 'r';
ansiEscapes.setRegion = (top, bottom) => {
    if (typeof top !== 'number') {
          throw new TypeError('The `top` argument is required');
        }

    if (typeof bottom !== 'number') {
          throw new TypeError('The `bottom` argument is required');
        }

    return ESC + (top + 1) + ';' + (bottom + 1) + 'r';
};

function getCursorPosition() {
  return new Promise(
    (resolve, reject) => {
      let to;
      // process.stdin.resume();
      process.stdin.setRawMode(true);
      // set up listener for response data
      let position;
      process.stdin.once('data', function (data) {
        var match = /\u001B\[(\d+)\;(\d+)R$/.exec(data.toString());
        if (match) {
          clearTimeout(to);
          position = match.slice(1, 3).reverse().map( n => Number(n)-1);
          resolve({ column: position[0], row: position[1] });
        } else {
          clearTimeout(to);
          reject(undefined);
        }
        // reset input stream to its defaults
        process.stdin.setRawMode(false);
        process.stdin.pause();
      });

      function sendReject () {
        clearTimeout(to);
        reject('No cursor position feedback');
      }

      // send the Escape Sequence to get the cursor position from terminal
      process.stdout.write(ansiEscapes.cursorGetPosition);
      // set timeout handler
      to = setTimeout( sendReject, 10);
    }
  );
}

export default ProgressView;
