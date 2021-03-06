#!/usr/bin/env node
// Generated by CoffeeScript 1.6.3
(function() {
  var Docker, VERSION, amqp, attach, colors, docker, dockerOpts, domain, fragment_ids, getopt, opts, parse_packet;

  VERSION = '0.0.1';

  getopt = require('node-getopt').create([['d', 'docker=ARG', 'Docker URL (eg: /var/run/docker.sock or 127.0.0.1:4243)'], ['a', 'amqp=ARG', 'AMQP host (eg: localhost)'], ['e', 'exchange=ARG', 'exchange to publish messages to'], ['E', 'env=ARG+', 'env variables to include in pipe'], ['A', 'attach', 'attach already running containers'], ['l', 'log', 'output logs as they arrive'], ['h', 'help', 'show this help'], ['v', 'version', 'show program version']]).bindHelp().parseSystem();

  if (getopt.options.version) {
    return console.log('Aldis ' + VERSION);
  }

  opts = {
    docker_url: getopt.options.docker || '/var/run/docker.sock',
    amqp_host: getopt.options.amqp || 'localhost',
    exchange: getopt.options.exchange || 'aldis',
    env: getopt.options.env || []
  };

  Docker = require('dockerode');

  amqp = require('amqp');

  colors = require('colors');

  domain = require('domain');

  console.log('.. initializing aldis (hit ^C to quit)');

  if (opts.docker_url.indexOf(':') !== -1) {
    dockerOpts = opts.docker_url.split(':');
    dockerOpts = {
      host: dockerOpts[0],
      port: dockerOpts[1]
    };
  } else {
    dockerOpts = {
      socketPath: opts.docker_url
    };
  }

  docker = new Docker(dockerOpts);

  fragment_ids = {};

  amqp.createConnection({
    host: opts.amqp_host
  }, {
    reconnect: false
  }, function(conn) {
    console.log((' ✓ connected to amqp at "' + opts.amqp_host + '"').green);
    return conn.exchange(opts.exchange, {
      type: 'fanout'
    }, function(exchange) {
      console.log('.. publishing to exchange ' + opts.exchange.yellow);
      if (getopt.options.attach) {
        console.log('.. attaching already running containers');
        docker.listContainers(null, function(err, containers) {
          if (!containers) {
            return;
          }
          return containers.forEach(function(data) {
            return attach(docker.getContainer(data.Id), exchange);
          });
        });
      }
      return docker.getEvents(null, function(err, stream) {
        if (err) {
          throw err;
        }
        console.log((' ✓ connected to docker at "' + opts.docker_url + '"').green);
        return stream.on('data', function(data) {
          data = JSON.parse(data);
          if (data.status !== 'create') {
            return;
          }
          return attach(docker.getContainer(data.id), exchange);
        });
      });
    });
  });

  attach = function(container, exchange) {
    return domain.create().on('error', function(err) {
      if (err.code !== 'ECONNRESET') {
        throw err;
      }
    }).run(function() {
      return container.inspect(function(err, info) {
        var env, evar, name, use_multiplexing, _i, _j, _len, _len1, _ref, _ref1;
        if (err) {
          throw err;
        }
        use_multiplexing = !info.Config.Tty;
        env = {};
        if (info.Config.Env && opts.env.length > 0) {
          _ref = info.Config.Env;
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            evar = _ref[_i];
            evar = evar.split('=');
            _ref1 = opts.env;
            for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
              name = _ref1[_j];
              if (evar[0] === name) {
                env[evar[0]] = evar[1];
              }
            }
          }
        }
        console.log('<- attaching container ' + container.id.substr(0, 12).yellow);
        return container.attach({
          logs: false,
          stream: true,
          stdout: true,
          stderr: true
        }, function(err, stream) {
          if (err) {
            throw err;
          }
          stream.on('end', function() {
            delete fragment_ids[container.id];
            return console.log('-> detaching container ' + container.id.substr(0, 12).yellow);
          });
          fragment_ids[container.id] = 0;
          return stream.on('data', function(packet) {
            var e;
            try {
              return parse_packet(packet, use_multiplexing, function(frame) {
                var fragment_id, message;
                fragment_id = fragment_ids[container.id]++;
                if (getopt.options.log) {
                  process.stdout.write(fragment_id + '> ' + frame.content);
                }
                message = {
                  container: container.id,
                  fragment_id: fragment_id,
                  env: env,
                  type: frame.type,
                  length: frame.length,
                  content: frame.content,
                  timestamp: Date.now()
                };
                return exchange.publish('', message);
              });
            } catch (_error) {
              e = _error;
              console.log('could not parse packet: '.red + e.message);
              return console.log(packet);
            }
          });
        });
      });
    });
  };

  parse_packet = function(packet, use_multiplexing, callback) {
    var buf, content, length, offset, type, _ref, _results;
    if (!use_multiplexing) {
      return [null, Buffer.byteLength(packet, 'utf8'), line];
    }
    offset = 0;
    buf = new Buffer(packet);
    _results = [];
    while (offset < buf.length) {
      type = buf.readUInt8(offset);
      length = buf.readUInt32BE(offset + 4);
      content = buf.toString('utf8', offset + 8, offset + 8 + length);
      if ((_ref = !type) === 0 || _ref === 1 || _ref === 2) {
        throw new Error('Unknown stream type ' + frame.type);
      }
      callback({
        type: type,
        length: length,
        content: content
      });
      _results.push(offset = offset + 8 + length);
    }
    return _results;
  };

  String.prototype.padLeft = function(padValue) {
    return String(padValue + this).slice(-padValue.length);
  };

}).call(this);