'use strict';

import chalk from 'chalk';
import { promisify } from 'util';
import readline from 'readline';
import ProgressView from './progress-view.mjs';

const sleep = promisify(setTimeout);

const PV = new ProgressView();

async function main() {

  // Signal handling and keypress on exit prep
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: true
  });

  rl.on('SIGINT', () => {
    console.log('readline: SIGINT signal received.');
    pv.reset();
    process.exit(1);
  });

  process.on('SIGTERM', () => {
    // usual signalling method of systemd etc.
    console.log('SIGTERM signal received.');
    pv.reset();
    process.exit(1);
  });

  // Main loop for demonstration

  // Instantiate a new View
  const pv = new ProgressView();

  // Initialise the view with a sample data structure
  pv.init({
    preservePreviousScreen: true,
    progressHeader: 'Records',
    progressSymbol: ' ',
    progressType: 'NUMBER',
    progressValMax: 1234567890,
    progressColour: chalk.white.bgGreenBright,
    progressBackground: chalk.black.bgBlackBright,
    statsConfig: [
      [ { name: '     read:', digits: 12, style: 'NONE' },
        { name: 'r_per_sec:', digits:  5, style: 'SPARK' }],
      [ { name: '    write:', digits: 12, style: 'NONE' },
        { name: 'w_per_sec:', digits:  5, style: 'SPARK' }],
      [ { name: '     sync:', digits: 12, style: 'NONE' },
        { name: 's_per_sec:', digits:  5, style: 'SPARK' }],
      [ { name: '  r_queue:', digits:  5, style: 'GAUGE', colour: chalk.white.bgMagenta }],
      [ { name: '  w_queue:', digits:  5, style: 'GAUGE', colour: chalk.bgRgb(255, 136, 0) }]
    ]
  });

  // simulate some log entries in the background
  let n = 0;
  const giveOutput = () => {
    process.stdout.write(`This is log line # ${n++}\n`);
  }
  let ov = setInterval(giveOutput, 100);

  // define starting values for the simulation
  let oldstats = [
    [ { name: '     read:', val: 0 },
      { name: 'r_per_sec:', val: Math.random() * 8000} ],
    [ { name: '    write:', val: 0 },
      { name: 'w_per_sec:', val: Math.random() * 3000} ],
    [ { name: '     sync:', val: 0 },
      { name: 's_per_sec:', val: Math.random() * 7000} ],
    [ { name: '  r_queue:', val: 4000 + Math.random() * 10000} ],
    [ { name: '  w_queue:', val: 2000 + Math.random() * 10000} ]
  ];

  // simulate a progressing task with statistics
  // either go for a PERCENTage based progress
  // for (let p = 0; p <= 100; p = p + 0.3 ) {
  // or for a NUMBER based progress
  let no_records = 1234567890;
  for (let p = 0; p <= no_records; p = p + 4000000 ) {
    // the progress bar is updated like that
    pv.updateProgress(p);
    // the simulated statistics data
    let r_queue = oldstats[3][0].val + (Math.random() > 0.55 ? 1 : -1) * Math.random() * 500;
    if (r_queue < 0) r_queue = 0;
    let w_queue = oldstats[4][0].val + (Math.random() > 0.45 ? 1 : -1) * Math.random() * 500;
    if (w_queue < 0) w_queue = 0;
    let stats = [
      [ { name: '     read:', val: oldstats[0][0].val + Math.random() * 5000 },
        { name: 'r_per_sec:', val: Math.random() * 8000} ],
      [ { name: '    write:', val: oldstats[1][0].val + Math.random() * 5000},
        { name: 'w_per_sec:', val: Math.random() * 3000} ],
      [ { name: '     sync:', val: oldstats[2][0].val + Math.random() * 5000},
        { name: 's_per_sec:', val: Math.random() * 7000} ],
      [ { name: '  r_queue:', val: r_queue } ],
      [ { name: '  w_queue:', val: w_queue } ],
    ];
    // the statistics are updated like that
    pv.updateStatistics(stats);
    oldstats = stats;
    await sleep(20);
  }
  pv.updateProgress(no_records);

  await sleep(1500);
  // clear logging simulation
  clearInterval(ov);

  process.stdout.write('Press <Enter> to quit, "k"-<Enter> to keep this output buffer...');
  rl.on('line', (answer) => {
    if (answer === "k") {
      // Argunent: overrideScreenRestore
      // Values:
      //   true = regardless if preservePreviousScreen was true, keep the
      //          current output
      //   false or undefined = keep the initialization settings
      pv.reset(true);
    } else {
      pv.reset();
    }
    // with this close the eventloop exits
    rl.close();
  });
}

main();
