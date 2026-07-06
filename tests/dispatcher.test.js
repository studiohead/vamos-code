import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJiraKey } from '../dist/src/dispatcher.js';

test('extracts a Jira ticket key from a natural-language playwright request', () => {
  assert.equal(extractJiraKey('Use Jira ticket CLN-1234 to create a new playwright test'), 'CLN-1234');
});

test('returns null when no ticket key is present', () => {
  assert.equal(extractJiraKey('just refactor the login page please'), null);
});

test('extracts a key regardless of surrounding punctuation', () => {
  assert.equal(extractJiraKey('fix bug ABC-99, it is urgent'), 'ABC-99');
});
