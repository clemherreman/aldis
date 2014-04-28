# Aldis, a log forwarder for Docker.

Aldis connects to Docker's remote API and attaches containers as they are created to forward logs to an AMQP exchange.

This is a temporary solution while waiting for a more standard way of handling container output in Docker, but it works. I'm not even sure you should use this.

## Installation

Use npm to install aldis:

    npm install aldis

or if you wish to install aldis globally:

    npm install -g aldis

## Usage

Use the `-h` option to get a listing of all available options:

      -d, --docker=ARG    Docker URL (eg: /var/run/docker.sock or 127.0.0.1:4243)
      -a, --amqp=ARG      AMQP host (eg: localhost)
      -e, --exchange=ARG  exchange to publish messages to
      -E, --env=ARG+      env variables to include in pipe
      -A, --attach        attach already running containers
      -l, --log           output logs as they arrive
      -h, --help          show this help
      -v, --version       show program version

By default, Aldis will forward all logs to an `aldis` exchange in any AMQP server that happens to listen on `localhost`.

You can also include arbitrary environment variables from the container, using the `-E` switch (only environment variables defined in the container's configuration are available though).

## Receiving messages

Messages will contain a JSON structure looking like this:

    { container:   (string)    container id,
      fragment_id: (int)       an auto-increment id for this message,
      env:         (array)     an array of env variables from the container,
      type:        (int)       stream type (0 = stdin, 1 = stdout, 2 = stderr),
      length:      (int)       the byte length of the log line,
      content:     (string)    actual log line,
      timestamp:   (string)    the time at which aldis received the log line }
