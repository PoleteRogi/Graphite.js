// create wrapper
const wrapper = new NodeWrapper();

// link canvas to it
wrapper.LinkCanvas(document.getElementById('graphite-canvas'));
wrapper.LoadTheme('./theme.json')

// register the node sets (the nodes the app will use)
NodeRegistry.RegisterSet(STANDARD_NODE_SET);

// update function for every frame
function update()
{
    requestAnimationFrame(update);
    
    // update and evaluate all nodes
    wrapper.UpdateNodes();
}

// run update function
update();