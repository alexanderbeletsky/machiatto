var EventEmitter = require('events').EventEmitter;
var path = require('path');

var async = require('async');
var glob = require('glob');

function runner(options, callback) {
	var files = options.files;
	// TODO: allow to use custom reporter as mocha does..
	var Reporter = require('./reporters/' + options.reporter);

	glob(files + '/*.spec.js', loadSuitesAndRun);

	function loadSuitesAndRun(err, files) {
		if (err) {
			throw err;
		}

		var suites = files.map(function (file) {
			var suite = require(path.resolve(file));
			if (!suite) {
				throw new Error('failed to load suite from ' + file + '. missing `module.exports = spec`?');
			}
			return suite;
		});

		var asserts = suites.reduce(function (asserts, suite) {
			return asserts.concat(suite._asserts());
		}, []);

		var only = asserts.filter(function (assert) {
			return assert.only;
		});

		asserts = only.length > 0 ? only : asserts;

		var grouped = groupAssertsBySuite(asserts);

		executeAsserts(grouped, callback);
	}

	function groupAssertsBySuite(asserts) {
		return asserts.reduce(function (asserts, assert) {
			var suiteName = assert.suite;
			var suiteAsserts = asserts[suiteName] || [];

			suiteAsserts.push(assert);
			asserts[suiteName] = suiteAsserts;

			return asserts;
		}, {});
	}

	function runAssert(runner, reporter) {
		return function (assert, callback) {
			assert.run(runner, callback);
		};
	}

	function executeAsserts(grouped, callback) {
		var runner = new EventEmitter();
		var reporter = new Reporter(runner);

		runner.emit('start');

		var suiteNames = Object.keys(grouped);
		async.eachSeries(suiteNames, function (suiteName, callback) {
			// TODO: {root: false} - for all cases, need to fixed..
			var suite = {title: suiteName, root: false};
			runner.suite = suite;

			runner.emit('suite', suite);

			var asserts = grouped[suiteName];
			async.eachSeries(asserts, runAssert(runner, reporter), function (err) {
			runner.emit('suite end', suite);
				callback(err);
			});

		}, function (err) {
			if (err) {
				throw err;
			}

			runner.emit('end');

			callback(err, reporter.stats);
		});
	}
}

module.exports = runner;

