# Getting Started

This guide walks you through creating your first node graph.

## 1. Create a Canvas

Graphite.js renders onto an HTML canvas.

```html
<canvas id="graph"></canvas>
```

## 2. Initialize the Wrapper
The `NodeWrapper` manages rendering, interaction, and node execution.

We can link a canvas to the wrapper with the `LinkCanvas` function.

```javascript
const wrapper = new NodeWrapper();

wrapper.LinkCanvas(document.getElementById("graph"));
```

## 3. Add Nodes
### Context menu
There's 2 ways of adding *nodes* to the wrapper. Either by the context menu (right click on the graph), or via code.

To enable the user to add *nodes* via the context menu, we first need to register which *sets*/*nodes* are registered.

A *set* is an array of classes that can be added to the `NodeRegistry` so that the wrapper knows which *nodes* are enabled. The `NodeRegistry` is a static global class that the wrapper references.

```javascript
// Register the STANDARD_NODE_SET (basic Maths, Logic, IO...)
NodeRegistry.RegisterSet(STANDARD_NODE_SET);
```

Then, if we check our html file, we'll see that we can right click to add nodes.

### Add nodes via code
`NodeWrapper` features the `AddNode` function, which lets us do just that.

```javascript
// Create node
const myNode = new NumberNode();
// Add the node to the wrapper
wrapper.AddNode(myNode);

// Create node
const myOtherNode = new DisplayNode();
// Add the node to the wrapper
wrapper.AddNode(myOtherNode);
```

We can also link two node properties via code.

```javascript
myNode.Out[0].Link(myOtherNode.In[0]);
```

## 4. Running and evaluating
Graphite.js handles the evaulation and runtime of the nodes automatically, but to run you need to tell the wrapper when to update/run your code.

As a simple example, let's run the nodes every frame

```javascript
function update()
{
    requestAnimationFrame(update);

    // Evaluate
    wrapper.UpdateNodes();
}

update();
```

<h3 align="right">
    <a href="./core-concepts.md">NEXT</a>
</h3>