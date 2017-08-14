/**
 *  Copyright (c) Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the license found in the
 *  LICENSE file in the root directory of this source tree.
 */

/* eslint-disable no-console */
import express from 'express';
import path from 'path';
import browserify from 'browserify';
import browserifyShim from 'browserify-shim';
import watchify from 'watchify';
import babelify from 'babelify';
import graphqlHTTP from 'express-graphql';
import {
  TraceCollector,
  instrumentSchemaForTracing,
  formatTraceData,
} from 'apollo-tracing';

import schema from './schema';

const app = express();

// Server
if (process.env.TRACING) {
  app.use(
    '/graphql',
    (req, res, next) => {
      const traceCollector = new TraceCollector();
      traceCollector.requestDidStart();
      req._traceCollector = traceCollector;
      next();
    },
    graphqlHTTP(request => ({
      schema: instrumentSchemaForTracing(schema),
      context: {
        _traceCollector: request._traceCollector,
      },
      extensions: () => {
        const traceCollector = request._traceCollector;
        traceCollector.requestDidEnd();
        return {
          tracing: formatTraceData(traceCollector),
        };
      },
    })),
  );
} else {
  app.use('/graphql', graphqlHTTP({ schema }));
}

// Client
let bundleBuffer;

const b = browserify({
  entries: [path.join(__dirname, '../src/index.js')],
  cache: {},
  packageCache: {},
  transform: [babelify, browserifyShim],
  plugin: [watchify],
  standalone: 'GraphiQL',
  globalTransform: 'browserify-shim',
});

b.on('update', () => makeBundle());
b.on('log', msg => console.log(`graphiql.js: ${msg}`));

function makeBundle(callback) {
  b.bundle((err, buffer) => {
    if (err) {
      console.error('Error building graphiql.js');
      console.error(err);
      return;
    }
    bundleBuffer = buffer;
    callback && callback();
  });
}

app.use('/graphiql.js', (req, res) => {
  res.end(bundleBuffer);
});

app.use('/css', express.static(path.join(__dirname, '../css')));
app.use(express.static(__dirname));

console.log('Initial build...');
makeBundle(() => {
  app.listen(0, function() {
    const port = this.address().port;
    console.log(`Started on http://localhost:${port}/`);
  });
});
