var del = require("del"),
	path = require("path"),
	defaults = require("defaults"),
	fs = require("fs-extra"),
	browserSync = require('browser-sync').create(),
	dependencies = require("./plugins/dependencies"),
	dependents = require("./plugins/dependents");

var configDefaults = {
	state: {
		src: "dist/site",
		dest: "dist/state",
		report: "reports/state",
		baseurl: ""
	},
	serve: {
		port: 9001,
		open: true,
		path: "/"
	},
	options: {
		ignore_inline_svg: true,
		ignore_mailto: true,
		ignore_cc_editor_links: true,
		scan_js: true
	}
};

module.exports = function (gulp, config) {
	let dependenciesFilename = "/dependencies.json";
	let dependentsFilename = "/dependents.json";

	config = config || {};

	config.state = defaults(config.state, configDefaults.state);
	config.serve = defaults(config.serve, configDefaults.serve);
	config.options = defaults(config.options, configDefaults.options);

	var cwd = process.cwd();
	config.state._src = config.state.src;
	config.state._dest = config.state.dest;
	config.state.src = path.join(cwd, config.state.src);
	config.state.dest = path.join(cwd, config.state.dest);

	var fullDest = path.join(config.state.dest, config.state.baseurl);

	// -----
	// Graph

	gulp.task("state:find-unused", function () {
		var data = fs.readFileSync(config.state.report + reportFilename, "utf8");
		data = JSON.parse(data);
		console.log("UNUSED ASSETS:")
		return gulp.src([config.state.src + "/**/*"], { nodir: true })
			.on("data", function (file) {
				var filePath = file.path.substring(file.base.length);
				filePath = filePath.replace(/\/index.html?/i, "/");
				for (var key in data) {
					if (data[key].assets.includes(filePath)
						|| data[key].internalLinks.includes(filePath)
						|| data[key].externalLinks.includes(filePath)) {
							return;
						}
				}
				console.log(filePath);
			});
	});

	gulp.task("state:build", async function (done) {
		try {
			await fs.ensureDir(config.state.dest);
			await fs.copyFile(path.join(config.state.report, dependenciesFilename), path.join(config.state.dest, dependenciesFilename));
			await fs.copyFile(path.join(config.state.report, dependentsFilename), path.join(config.state.dest, dependentsFilename));
			await fs.copyFile(path.join(__dirname, "./index.html"), path.join(config.state.dest, "/index.html"));
		} catch (err) {
			console.log(err);
		}
		done();
	});

	var dependenciesGraph = {};
	var dependentsGraph = {};
	var filenameList = [];

	function getFilenameList (done) {
		if (!config.options.scan_js) {
			done();
		} else {
		gulp.src([config.state.src + "/**/*"], { nodir: true })
			.on("data", function (file) {
				filenameList.push(file.path.substring(file.base.length).replace(/\/index.html?/i, "/"));
			}).on("end", function(){
				done();
			});
		}
	}

	gulp.task("state:dependencies", gulp.series(getFilenameList, function (done) {
		let srcPath = config.state.src + "/**/*";
		gulp.src(
			[srcPath + ".html", srcPath + ".css", srcPath + ".js"], 
			{ nodir: true })
		.pipe(dependencies(config.options, filenameList))
		.on("data", function (data) {
			dependenciesGraph[data[0]] = data[1];
		}).on("end", function () {
			fs.ensureFile(config.state.report + dependenciesFilename)
				.then(function() {
					fs.writeJSON(config.state.report + dependenciesFilename, dependenciesGraph);
					done();
				}).catch(function(err) {
					console.log(err);
					done();
				});
		});
	}));

	gulp.task("state:dependents", gulp.series("state:dependencies", function (done) {
		gulp.src([config.state.src + "/**/*"], { nodir: true})
			.pipe(dependents(config.options, dependenciesGraph))
			.on("data", function (data) {
				dependentsGraph[data[0]] = data[1];
			}).on("end", function () {
				fs.ensureFile(config.state.report + dependentsFilename)
				.then(function() {
					fs.writeJSON(config.state.report + dependentsFilename, dependentsGraph);
					done();
				}).catch(function(err) {
					console.log(err);
					done();
				});
			});
	}));

	// -----
	// Serve

	gulp.task("state:clean", function () {
		return del(config.state.dest);
	});
	
	gulp.task("state:serve", function (done) {
		browserSync.init({
			server: {
				baseDir: config.state.dest
			},
			port: config.serve.port,
		});
		done();
	});

	// -------
	// Default

	gulp.task("state", gulp.series("state:dependents", "state:clean", "state:build", "state:serve"));
};
