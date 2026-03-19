<!--TODO: FINISH DOCS-->

<!--
# Core Concepts

Graphite.js is built around a few key building blocks.

## Node

A node is the primary unit of logic.

Each node can contain:
- Inputs
- Outputs
- Static values
- Processing of values

Example:

```js
class DoubleNode extends Node {
    constructor() {
        // Construct using the node's name
        super("Double (x2)");

        // Set inputs and outputs
        this.In = [
            new NodeInput('MyInput', this, 'float')
        ]

        this.Out = [
            new NodeInput('MyOutput', this, 'float')
        ]

        // Set how the output is calculated
        this.Out[0].GetValue = function()
        {
            return parseFloat(this.ParentNode.GetInputValue('MyInput')) * 2
        }
    }
}
```

## Input and outputs

-->