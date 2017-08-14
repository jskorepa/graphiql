/**
 *  Copyright (c) Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the license found in the
 *  LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import PropTypes from 'prop-types';

const tranformTracing = tracing => {
  const resolvers = tracing.execution.resolvers;
  const obj = {
    data: {
      startTime: tracing.startTime,
      endTime: tracing.endTime,
      duration: tracing.duration,
    },
  };
  for (const resolver of resolvers) {
    obj['data.' + resolver.path.join('.')] = resolver;
  }
  return obj;
};

const getOptions = props => {
  // if there is no value there is nothing to trace
  if (!props.tracing || !props.value) {
    return { value: props.value || '' };
  }
  try {
    const parsed = JSON.parse(props.value);
    // if there is no trace, there is nothing to display
    if (!parsed.extensions || !parsed.extensions.tracing) {
      return { value: props.value, info: { tracing: false } };
    }
    // remove trace from extensions
    const tracing = parsed.extensions.tracing;
    delete parsed.extensions.tracing;
    if (Object.keys(parsed.extensions).length < 1) {
      delete parsed.extensions;
    }
    const value = JSON.stringify(parsed, null, 2);
    return {
      value,
      info: {
        value,
        tracing,
        resolvers: tranformTracing(tracing),
      },
    };
  } catch (e) {
    return { value: props.value };
  }
};

function render(into, path, info) {
  const unit = val => (typeof val === 'number' ? val / 1000 + 'us' : val);
  const line = (head, val) =>
    val ? '<b>' + head + ':</b> ' + unit(val) + '<br>' : '';
  into.innerHTML =
    String() +
    '<i>' +
    path +
    '</i><br>' +
    line('Start offset', info.startOffset) +
    line('Start time', info.startTime) +
    line('End time', info.endTime) +
    line('Duration', info.duration);
}

const jsonGetPath = (jsonText, place /* {ch, line}*/) => {
  const stack = [ {} ]; // { name: string, type: 'object' | 'array' }
  let pos = 1;
  let context = 'object'; // 'object' | 'array' | 'value'
  let line = 0;
  let ch = 0;

  while (line <= place.line && (ch < place.ch || line < place.line)) {
    const frame = stack[stack.length - 1];

    // console.log(jsonText);
    // console.log(repeat(' ', pos) + '^');
    // console.log(frame);

    switch (jsonText[pos]) {
      case '{':
        stack.push({
          type: 'object',
          name: 0,
        });
        context = 'object';
        break;
      case '[':
        stack.push({
          type: 'array',
          name: 0,
        });
        context = 'array';
        break;
      case '}':
        stack.pop();
        context = stack[stack.length - 1].type;
        break;
      case ']':
        stack.pop();
        context = stack[stack.length - 1].type;
        break;
      case ',':
        if (frame.type === 'array') {
          frame.name++;
          frame.type = 'unknown';
        }
        break;
      case ':':
        context = 'value';
        break;
      case '"':
        const curText = jsonText.slice(pos + 1);
        const toEnd = /^([^"\\]|\\.)*"/.exec(curText)[0];
        pos += toEnd.length;
        ch += toEnd.length;
        if (context === 'object') {
          frame.name = toEnd.slice(0, toEnd.length - 1);
        }
        break;
      case '\n':
        line++;
        ch = 0;
        break;
    }
    pos++;
    ch++;
  }
  return stack.map(e => e.name).join('.');
};

/**
 * ResultViewer
 *
 * Maintains an instance of CodeMirror for viewing a GraphQL response.
 *
 * Props:
 *
 *   - value: The text of the editor.
 *
 */
export class ResultViewer extends React.Component {
  static propTypes = {
    value: PropTypes.string,
    editorTheme: PropTypes.string,
    tracing: PropTypes.bool,
  };

  componentDidMount() {
    // Lazily require to ensure requiring GraphiQL outside of a Browser context
    // does not produce an error.
    const CodeMirror = require('codemirror');
    require('codemirror/addon/fold/foldgutter');
    require('codemirror/addon/fold/brace-fold');
    require('codemirror/addon/dialog/dialog');
    require('codemirror/addon/search/search');
    require('codemirror/keymap/sublime');
    require('codemirror-graphql/results/mode');
    require('codemirror-graphql/utils/info-addon');
    if (this.props.tracing) {
      CodeMirror.registerHelper(
        'info',
        'graphql-results',
        (token, options, cm, pos) => {
          if (!options.value) {
            return;
          }
          const tag = document.createElement('div');
          const path = jsonGetPath(options.value, pos);
          const info = options.resolvers[path];
          if (!info) {
            return;
          }
          render(tag, path, info);
          return tag;
        },
      );
    }

    this.viewer = CodeMirror(this._node, {
      ...getOptions(this.props),
      lineWrapping: true,
      readOnly: true,
      theme: this.props.editorTheme || 'graphiql',
      mode: 'graphql-results',
      keyMap: 'sublime',
      foldGutter: {
        minFoldSize: 4,
      },
      hoverTime: 100,
      gutters: [ 'CodeMirror-foldgutter' ],
      extraKeys: {
        // Editor improvements
        'Ctrl-Left': 'goSubwordLeft',
        'Ctrl-Right': 'goSubwordRight',
        'Alt-Left': 'goGroupLeft',
        'Alt-Right': 'goGroupRight',
      },
    });
  }

  shouldComponentUpdate(nextProps) {
    return this.props.value !== nextProps.value;
  }

  componentDidUpdate() {
    const { value, info } = getOptions(this.props);
    this.viewer.setValue(value);
    if (this.props.tracing) {
      this.viewer.setOption('info', info);
    }
  }

  componentWillUnmount() {
    this.viewer = null;
  }

  render() {
    return (
      <div
        className="result-window"
        ref={node => {
          this._node = node;
        }}
      />
    );
  }

  /**
   * Public API for retrieving the CodeMirror instance from this
   * React component.
   */
  getCodeMirror() {
    return this.viewer;
  }

  /**
   * Public API for retrieving the DOM client height for this component.
   */
  getClientHeight() {
    return this._node && this._node.clientHeight;
  }
}
