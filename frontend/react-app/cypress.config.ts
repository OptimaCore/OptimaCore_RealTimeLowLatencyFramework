import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    viewportWidth: 1280,
    viewportHeight: 800,
    video: false,
    screenshotOnRunFailure: true,
    retries: {
      runMode: 2,
      openMode: 0,
    },
    env: {
      apiUrl: 'http://localhost:3000/api',
      coverage: false,
      codeCoverage: {
        url: 'http://localhost:3000/__coverage__',
      },
    },
    setupNodeEvents(on, config) {
      // Implement node event listeners here
      // This is a great place to load plugins
      require('@cypress/code-coverage/task')(on, config);
      require('cypress-mochawesome-reporter/plugin')(on);
      
      // Add other plugins here
      
      return config;
    },
  },
  component: {
    devServer: {
      framework: 'create-react-app',
      bundler: 'webpack',
    },
  },
});
