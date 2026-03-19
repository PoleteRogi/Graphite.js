// custom node that just says "Hello World!"
class HelloWorldNode extends Node
{
    constructor()
    {
        // call parent constructor, setting the node name
        super('Hello World');

        // create static value
        // static values are values that can only be set by the user on the gui
        // we use these for values that we don't want to set via nodes
        // they can also be used to display useful text with the ReadOnly property
        this.message = new StaticValue('Message', 'Hello World!', this, 'string');
        this.message.Settings.HideValueName = true;
        this.message.Settings.ReadOnly = true;

        // set static values
        this.StaticValues = [
            this.message
        ]
    }
}

// custom node that replicates the input value
class ReplicateNode extends Node
{
    constructor()
    {
        // call parent constructor, setting the node name
        super('Replicate');

        // create inputs and outputs
        this.input = new NodeInput('MyInput', this, 'any');
        this.output = new NodeOutput('MyOutput', this, 'any');

        this.In = [this.input];
        this.Out = [this.output];

        // we set the function that evaluates the output
        this.Out[0].GetValue = function()
        {
            // we just return the value of the input
            return this.ParentNode.GetInputValue('MyInput');
        }
    }
}

// register the node sets (the nodes the app will use)
NodeRegistry.RegisterSet(STANDARD_NODE_SET);

// register the nodes we created
NodeRegistry.Register(HelloWorldNode);
NodeRegistry.Register(ReplicateNode);

// create wrapper
const wrapper = new NodeWrapper();

// link canvas to it
wrapper.LinkCanvas(document.getElementById('graphite-canvas'));



// update function for every frame
function update()
{
    requestAnimationFrame(update);
    
    // update and evaluate all nodes
    wrapper.UpdateNodes();
}

// run update function
update();