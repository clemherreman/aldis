# Aldis, a log forwarder for Docker.

Aldis connects to Docker's remote API and attaches containers as they are created to forward logs to an AMQP exchange.

This is a temporary solution while waiting for a more standard way of handling container output in Docker, but it works.

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