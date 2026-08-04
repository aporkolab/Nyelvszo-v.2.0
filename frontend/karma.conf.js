// Karma configuration.
//
// The Angular builder (@angular/build:karma) supplies its own framework and
// plugin wiring, so this file only carries the browser, reporter and coverage
// settings.

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine'],
    plugins: [require('karma-jasmine'), require('karma-chrome-launcher'), require('karma-coverage')],
    client: {
      // Leave the Jasmine output visible after the run instead of clearing it.
      clearContext: false,
      jasmine: {
        // Randomised order catches tests that depend on each other's leftovers.
        random: true,
      },
    },
    reporters: ['progress', 'coverage'],
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage'),
      subdir: '.',
      reporters: [{ type: 'html' }, { type: 'text-summary' }, { type: 'lcovonly' }],
    },
    browsers: ['ChromeHeadless'],
    restartOnFileChange: true,
    singleRun: true,
  });
};
