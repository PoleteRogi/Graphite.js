// simple alert node
class AlertNode extends ActionNode
{
    constructor()
    {
        super('Alert');
        // don't override this.In on ActionNodes
        // ActionNodes already use an Input for the Action Condition
        this.In.push(new NodeInput('Message', this, 'string'));
    }

    // the function that runs when the node is triggered
    Action()
    {
        alert(this.GetInputValue('Message'));
    }
}

// simple on key press node (recommended)
class OnKeyPressNode extends ActionConditionNode
{
    constructor()
    {
        super('On Key Press');
        this.In.push(new NodeInput('Key', this, 'string'));
    
        document.addEventListener('keydown', (event) => {
            if(event.key == this.GetInputValue('Key'))
            {
                this.pressed = true;
            }
        });
    }

    pressed = false;

    // the function that calculates if the action node that's connected to this node should run
    DoesRun()
    {
        if(this.pressed) {this.pressed = false; return true; }
        return false;
    }
}

class OnKeyPressAlternativeNode extends ActionConditionNode
{
    constructor()
    {
        super('On Key Press Alternative');
        this.In.push(new NodeInput('Key', this, 'string'));
    
        document.addEventListener('keydown', (event) => {
            if(event.key == this.GetInputValue('Key'))
            {
                this.Action();
            }
        });
    }
}

// register the nodes
NodeRegistry.Register(AlertNode);
NodeRegistry.Register(OnKeyPressNode);
NodeRegistry.Register(OnKeyPressAlternativeNode);

// register the node sets (the nodes the app will use)
NodeRegistry.RegisterSet(STANDARD_NODE_SET);

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