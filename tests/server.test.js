const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Mock server.js for testing
const server = require('../server');

// Test suite for server.js
describe('HTTP Server Tests', function() {
  let testServer;
  let port = 8080;

  before(function(done) {
    // Start the server before running tests
    testServer = server.listen(port, done);
  });

  after(function(done) {
    // Close the server after tests
    testServer.close(done);
  });

  it('should return 200 for index.html', function(done) {
    http.get(`http://localhost:${port}/index.html`, function(response) {
      assert.strictEqual(response.statusCode, 200);
      done();
    });
  });

  it('should return 404 for non-existent file', function(done) {
    http.get(`http://localhost:${port}/nonexistent.html`, function(response) {
      assert.strictEqual(response.statusCode, 404);
      done();
    });
  });

  it('should serve directory listing', function(done) {
    http.get(`http://localhost:${port}/`, function(response) {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        assert(data.includes('[D]') || data.includes('[F]'));
        done();
      });
    });
  });

  it('should return correct content type for .html file', function(done) {
    http.get(`http://localhost:${port}/index.html`, function(response) {
      assert.strictEqual(response.headers['content-type'], 'text/html; charset=utf-8');
      done();
    });
  });
});
