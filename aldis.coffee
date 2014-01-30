#!/usr/bin/env coffee

#
# Format of piped messages:
#
# { container:  (string)    container id,
#   type:       (int)       stream type (0 = stdin, 1 = stdout, 2 = stderr),
#   line:       (string)    actual log line }
#

VERSION = '0.0.1'

getopt = require('node-getopt').create([
    ['d', 'docker=ARG', 'Docker URL (eg: /var/run/docker.sock or 127.0.0.1:4243)'],
    ['a', 'amqp=ARG', 'AMQP host (eg: localhost)'],
    ['e', 'exchange=ARG', 'exchange to publish messages to'],
    ['E', 'env=ARG+', 'env variables to include in pipe'],
    ['A', 'attach', 'attach already running containers'],
    ['l', 'log', 'output logs as they arrive'],
    ['h', 'help', 'show this help'],
    ['v', 'version', 'show program version']
])
.bindHelp()
.parseSystem()

if getopt.options.version
    return console.log('Aldis ' + VERSION)

opts =
    docker_url: getopt.options.docker   || '/var/run/docker.sock'
    amqp_host:  getopt.options.amqp     || 'localhost'
    exchange:   getopt.options.exchange || 'aldis'
    env:        getopt.options.env      || []

Docker = require('dockerode')
amqp   = require('amqp')
colors = require('colors')
domain = require('domain')

console.log('.. initializing aldis (hit ^C to quit)')

if opts.docker_url.indexOf(':') != -1
    dockerOpts = opts.docker_url.split(':')
    dockerOpts = { host: dockerOpts[0], port: dockerOpts[1] }
else
    dockerOpts = { socketPath: opts.docker_url }

docker = new Docker(dockerOpts)
fragment_ids = {};

amqp.createConnection({ host: opts.amqp_host }, { reconnect: false }, (conn) ->
    console.log((' ✓ connected to amqp at "' + opts.amqp_host + '"').green)

    conn.exchange(opts.exchange, { type: 'fanout' }, (exchange) ->
        console.log('.. publishing to exchange ' + opts.exchange.yellow)

        if getopt.options.attach
            console.log('.. attaching already running containers')
            docker.listContainers null, (err, containers) ->
                return unless containers
                containers.forEach (data) ->
                    attach(docker.getContainer(data.Id), exchange)

        docker.getEvents(null, (err, stream) ->
            throw err if err
            console.log((' ✓ connected to docker at "' + opts.docker_url + '"').green)

            stream.on('data', (data) ->
                data = JSON.parse(data)

                if data.status != 'create'
                    return

                attach(docker.getContainer(data.id), exchange)
            )
        )
    )
)

attach = (container, exchange) ->
    domain.create().on('error', (err) ->
        # most of the time it's dockerode replaying the callback when the connection is reset
        # see dockerode/lib/modem.js:87
        throw err unless err.code == 'ECONNRESET'
    ).run(->
        container.inspect((err, info) ->
            throw err if err

            use_multiplexing = not info.Config.Tty

            env = {}

            if info.Config.Env and opts.env.length > 0
                for evar in info.Config.Env
                    evar = evar.split '='
                    for name in opts.env
                        if evar[0] == name
                            env[evar[0]] = evar[1]

            console.log('<- attaching container ' + container.id.substr(0, 12).yellow)

            container.attach({ logs: false, stream: true, stdout: true, stderr: true }, (err, stream) ->
                throw err if err

                stream.on('end', ->
                    delete fragment_ids[container.id]
                    console.log('-> detaching container ' + container.id.substr(0, 12).yellow)
                )

                fragment_ids[container.id] = 0

                stream.on('data', (packet) ->

                    try
                        parse_packet(packet, use_multiplexing, (frame) ->
                            fragment_id = fragment_ids[container.id]++

                            if getopt.options.log
                                process.stdout.write(fragment_id + '> ' + frame.content)

                            message = {
                                container: container.id,
                                fragment_id: fragment_id,
                                env: env,
                                type: frame.type,
                                length: frame.length,
                                content: frame.content,
                                timestamp: Date.now()
                            }

                            exchange.publish('', message)
                        )
                    catch e
                        console.log 'could not parse packet: '.red + e.message
                        console.log packet
                )
            )
        )
    )

parse_packet = (packet, use_multiplexing, callback) ->
    if !use_multiplexing
        return [null, Buffer.byteLength(packet, 'utf8'), line]

    offset = 0

    buf = new Buffer(packet)

    while offset < buf.length

        type = buf.readUInt8(offset)
        length = buf.readUInt32BE(offset + 4)
        content = buf.toString('utf8', offset + 8, offset + 8 + length)

        if not type in [0, 1, 2]
            throw new Error('Unknown stream type ' + frame.type)

        callback { type: type, length: length, content: content }

        offset = offset + 8 + length

String::padLeft = (padValue) ->
    String(padValue + this).slice(-padValue.length)