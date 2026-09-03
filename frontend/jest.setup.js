// Loaded before every suite (jest.config.js -> setupFilesAfterEnv).
//
// @testing-library/jest-dom registers the DOM matchers — toBeInTheDocument,
// toBeEmptyDOMElement and friends. Installing the package is not enough: without
// this import the matchers simply do not exist, and the failure reads
// "expect(...).toBeInTheDocument is not a function" rather than anything about
// the component. Harmless in the node-environment suites, which never call them.
require('@testing-library/jest-dom');
