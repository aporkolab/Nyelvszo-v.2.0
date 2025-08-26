module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    exclude: [
          '**/assets/js/extention/custom-materialize.js'
        ],
  client: {
    jasmine: {
      random: false,
      failFast: false,
      stopOnSpecFailure: false
    },
    clearContext: false
  },
    reporters: ['progress'],
    browsers: ['ChromeHeadless'],
    singleRun: true,
  });
};
