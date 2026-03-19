class NodeOutput
{
    ParentNode = null;
    LinkedProperties = [];
    Name = "";
    Type = "float";

    constructor(name, parentNode, type="float")
    {
        this.ParentNode = parentNode;
        this.Name = name;
        this.Type = type;
    }

    Link(link)
    {
        if (!link.Type.split("|").includes(this.Type) && !this.Type.split("|").includes(link.Type) && this.Type != "any" && link.Type != "any") return;
        if (this.LinkedProperties.includes(link)) return;
        if (link.LinkedProperty != null) return;
        if (link.ParentNode == this.ParentNode) return;
        
        link.LinkedProperty = this;
        this.LinkedProperties.push(link);
    }

    GetValue() { return null; }
}

class NodeInput
{
    ParentNode = null;
    LinkedProperty = null;
    Name = "";
    Type = "float";
    DefaultValue = null;

    constructor(name, parentNode, type="float", DefaultValue=null)
    {
        this.ParentNode = parentNode;
        this.Name = name;
        this.Type = type;
        this.DefaultValue = DefaultValue;
    }

    GetValue()
    {
        if (this.LinkedProperty == null) return this.DefaultValue;
        return this.LinkedProperty.GetValue();
    }
}

class StaticValue {
    Name = "";
    Value = 0;
    Type = "float";
    Node = null;

    Settings = {
        ReadOnly: false,
        HideValueName: false,
        BypassPreviousLayout: false,
        TextColorOverride: null
    }

    constructor(name, value, node, type="float")
    {
        this.Name = name;
        this.Value = value;
        this.Node = node;
        this.Type = type;
    }
}

class Node {
    In = [];
    Out = [];
    Name = "Node";

    Settings = { Width: -1, Height: -1, X: 0, Y: 0, Opacity: 1 };

    StaticValues = [];
    Wrapper = null;

    constructor(name) { this.Name = name; }

    GetInputValue(name)
    {
        for(let i = 0; i < this.In.length; i++) { if (this.In[i].Name == name) return this.In[i].GetValue(); }
    }

    GetOutputValue(name)
    {
        for(let i = 0; i < this.Out.length; i++) { if (this.Out[i].Name == name) return this.Out[i].GetValue(); }
    }

    GetStaticValue(name)
    {
        for(let i = 0; i < this.StaticValues.length; i++) { if (this.StaticValues[i].Name == name) return this.StaticValues[i].Value; }
    }

    GetInputIndex(name)
    {
        for(let i = 0; i < this.In.length; i++) { if (this.In[i].Name == name) return i; }
    }

    Delete() {
        // Unlink all inputs
        for (let input of this.In) {
            if (input.LinkedProperty) {
                // Remove this input from the linked output's LinkedProperties array
                const output = input.LinkedProperty;
                const index = output.LinkedProperties.indexOf(input);
                if (index !== -1) output.LinkedProperties.splice(index, 1);

                // Clear the link
                input.LinkedProperty = null;
            }
        }

        // Unlink all outputs
        for (let output of this.Out) {
            // Go through each input linked to this output
            for (let linkedInput of output.LinkedProperties) {
                linkedInput.LinkedProperty = null; // Remove the link from the input side
            }
            output.LinkedProperties = []; // Clear the output's array
        }

        // Optionally clear static values
        this.StaticValues = [];

        // Finally remove from wrapper
        if (this.Wrapper) this.Wrapper.DeleteNode(this);

        // This `delete this` is usually unnecessary; JavaScript GC handles it once no references remain
    }

    Update() {}
}

class NodeWrapper {
    Renderer = {
        Canvas: undefined,
        Context: undefined,
        Width: 0,
        Height: 0,
        Viewport: { X: 0, Y: 0, Zoom: 1.5 },

        ThemeSettings: {
            BackgroundColor: '#121212',      
            NodeColor: '#1E1E1E',            
            ShadowColor: '#00000080',        
            ShadowBlur: 12,                  
            NodeTopBarColor: '#2A2A2A',      
            NodeBorderColor: '#2E2E2E',      
            NodeBorderWidth: 2,
            NodePropertyHeight: 22,          
            NodeOutputColor: '#4FC3F7',      
            NodeInputColor: '#FFB74D',    
            NodeRounding: 5,   
            LinkColorOutput: '#90CAF9',    
            LinkColorInput: '#FFCD83',   
            LinkColorPreview: '#90CAF9',     
            ValueChangingColor: '#90CAF9',
            LinkWidth: 2,                     
            TextSize: 8,                     
            TextColor: '#E0E0E0',             
            GridColor: '#1B1B1B',             
            GridSize: 50,
            Interpolation: 20,
            Font: 'Inter',
            
            ContextMenuWidth: 150,
            ContextMenuHeight: 200,
            ContextMenuBackgroundColor: '#1E1E1E8F',
            ContextMenuBorderColor: '#2E2E2E',
            ContextMenuBorderWidth: 2,
            ContextMenuRounding: 5
        }
    }

    LoadTheme(themePath)
    {
        fetch(themePath).then(res => res.json()).then(function(theme)
        {
            // make theme replace this.Renderer.ThemeSettings, but not overwrite it (properties that aren't defined in theme are ignored)
            Object.assign(this.Renderer.ThemeSettings, theme);
        }.bind(this)); 
    }

    Nodes = [];
    Variables = {};
    AddNode(node) { node.Wrapper = this; this.Nodes.push(node); return node; }
    DeleteNode(node) { this.Nodes.splice(this.Nodes.indexOf(node), 1); }

    #TrueViewport = { X: 0, Y: 0, Zoom: 1 };
    #lerp(a, b, t) { return a * (1 - t) + b * t; }

    #GraphSpaceToScreenSpace(x, y, w = 0, h = 0) {
        const { X, Y, Zoom } = this.#TrueViewport;
        return { x: (x - X) * Zoom, y: (y - Y) * Zoom, width: w * Zoom, height: h * Zoom };
    }

    #ScreenSpaceToGraphSpace(x, y) { return { x: x / this.#TrueViewport.Zoom + this.#TrueViewport.X, y: y / this.#TrueViewport.Zoom + this.#TrueViewport.Y }; }

    #ClearCanvas() {
        const ctx = this.Renderer.Context;
        const { Width, Height, ThemeSettings: Settings } = this.Renderer;
        ctx.fillStyle = Settings.BackgroundColor;
        ctx.fillRect(0, 0, Width, Height);
        this.#RenderGrid();
    }

    #RenderGrid() {
        const ctx = this.Renderer.Context;
        const { Width, Height, ThemeSettings: Settings } = this.Renderer;
        const { X, Y, Zoom } = this.#TrueViewport;

        ctx.strokeStyle = Settings.GridColor;
        ctx.lineWidth = 1;

        const gridSize = Settings.GridSize * Zoom;
        const startX = -((X * Zoom) % gridSize);
        const startY = -((Y * Zoom) % gridSize);

        for (let x = startX; x <= Width; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, Height); ctx.stroke(); }
        for (let y = startY; y <= Height; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(Width, y); ctx.stroke(); }
    }

    #RenderInputs(node) {
        const ctx = this.Renderer.Context;
        const inputs = node.In;
        for(let i = 0; i < inputs.length; i++)
        {
            const input = inputs[i];
            const inputName = input.Name;
            
            const inputRect = this.#GraphSpaceToScreenSpace(
                node.Settings.X,
                node.Settings.Y + 20 + i * this.Renderer.ThemeSettings.NodePropertyHeight,
                node.Settings.Width,
                this.Renderer.ThemeSettings.NodePropertyHeight
            );
        
            // input name
            ctx.fillStyle = this.Renderer.ThemeSettings.TextColor;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.font = this.Renderer.ThemeSettings.TextSize * this.#TrueViewport.Zoom + "px " + this.Renderer.ThemeSettings.Font;
            ctx.fillText(inputName, inputRect.x + inputRect.height / 3, inputRect.y + inputRect.height / 2);

            // bottom border
            ctx.strokeStyle = this.Renderer.ThemeSettings.NodeBorderColor;
            ctx.lineWidth = this.Renderer.ThemeSettings.NodeBorderWidth;
            ctx.beginPath();
            ctx.moveTo(inputRect.x, inputRect.y + inputRect.height);
            ctx.lineTo(inputRect.x + inputRect.width, inputRect.y + inputRect.height);
            ctx.stroke();

            // input handle (circle in the left)
            ctx.fillStyle = this.Renderer.ThemeSettings.NodeInputColor;
            ctx.beginPath();
            ctx.arc(inputRect.x, inputRect.y + inputRect.height / 2, 2 * this.#TrueViewport.Zoom, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    #RenderOutputs(node)
    {
        const ctx = this.Renderer.Context;
        const outputs = node.Out;
        for(let i = 0; i < outputs.length; i++)
        {
            const output = outputs[i];
            const outputName = output.Name;

            const outputRect = this.#GraphSpaceToScreenSpace(
                node.Settings.X,
                node.Settings.Y + 20 + i * this.Renderer.ThemeSettings.NodePropertyHeight,
                node.Settings.Width,
                this.Renderer.ThemeSettings.NodePropertyHeight
            )

            // output name
            ctx.fillStyle = this.Renderer.ThemeSettings.TextColor;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.font = this.Renderer.ThemeSettings.TextSize * this.#TrueViewport.Zoom + "px " + this.Renderer.ThemeSettings.Font;
            ctx.fillText(outputName, outputRect.x + outputRect.width - outputRect.height / 3, outputRect.y + outputRect.height / 2);

            // bottom border
            ctx.strokeStyle = this.Renderer.ThemeSettings.NodeBorderColor;
            ctx.lineWidth = this.Renderer.ThemeSettings.NodeBorderWidth;
            ctx.beginPath();
            ctx.moveTo(outputRect.x, outputRect.y + outputRect.height);
            ctx.lineTo(outputRect.x + outputRect.width, outputRect.y + outputRect.height);
            ctx.stroke();

            // output handle (circle in the right)
            ctx.fillStyle = this.Renderer.ThemeSettings.NodeOutputColor;
            ctx.beginPath();
            ctx.arc(outputRect.x + outputRect.width, outputRect.y + outputRect.height / 2, 2 * this.#TrueViewport.Zoom, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    #RenderStaticValues(node)
    {
        // gui that lets users change and edit static values that are dependent on each node

        const ctx = this.Renderer.Context;
        const staticValues = node.StaticValues;
        for(let i = 0; i < staticValues.length; i++)
        {
            const staticValue = staticValues[i];
            const staticValueName = staticValue.Name;

            const staticValueRect = this.#GraphSpaceToScreenSpace(
                node.Settings.X,
                node.Settings.Y + 20 + Math.max(node.Out.length, node.In.length) * this.Renderer.ThemeSettings.NodePropertyHeight * (staticValue.Settings.BypassPreviousLayout ? 0 : 1) + i * this.Renderer.ThemeSettings.NodePropertyHeight,
                node.Settings.Width,
                this.Renderer.ThemeSettings.NodePropertyHeight
            )

            if(!staticValue.Settings.HideValueName)
            {
                // static value name
                ctx.fillStyle = this.Renderer.ThemeSettings.TextColor;
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.font = this.Renderer.ThemeSettings.TextSize * this.#TrueViewport.Zoom + "px " + this.Renderer.ThemeSettings.Font;
                ctx.fillText(staticValueName, staticValueRect.x + staticValueRect.height / 3, staticValueRect.y + staticValueRect.height / 2);
            }

            // bottom border
            ctx.strokeStyle = this.Renderer.ThemeSettings.NodeBorderColor;
            ctx.lineWidth = this.Renderer.ThemeSettings.NodeBorderWidth;
            ctx.beginPath();
            ctx.moveTo(staticValueRect.x, staticValueRect.y + staticValueRect.height);
            ctx.lineTo(staticValueRect.x + staticValueRect.width, staticValueRect.y + staticValueRect.height);
            ctx.stroke();

            if(this.#editingStaticValue == staticValue) continue;
            // static value value
            ctx.fillStyle = this.Renderer.ThemeSettings.TextColor;
            if(staticValue.Settings.TextColorOverride) ctx.fillStyle = staticValue.Settings.TextColorOverride;
            if(staticValue.Settings.ReadOnly) ctx.globalAlpha = 0.5;

            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.font = this.Renderer.ThemeSettings.TextSize * this.#TrueViewport.Zoom + "px " + this.Renderer.ThemeSettings.Font;
            ctx.fillText(staticValue.Value, staticValueRect.x + staticValueRect.width - staticValueRect.height / 3, staticValueRect.y + staticValueRect.height / 2);
            ctx.globalAlpha = 1;
        }
    }

    #AutoSizeNode(node) {
        const width = 100;
        const normalStaticCount = node.StaticValues.filter(sv => !sv.Settings.BypassPreviousLayout).length;
        const height = 20 + Math.max(node.In.length, node.Out.length) * this.Renderer.ThemeSettings.NodePropertyHeight + normalStaticCount * this.Renderer.ThemeSettings.NodePropertyHeight;
        node.Settings.Width = width;
        node.Settings.Height = height;
    }

    #RenderNode(node) {
        if (node.Settings.Width === -1 || node.Settings.Height === -1) this.#AutoSizeNode(node);

        const ctx = this.Renderer.Context;
        const rect = this.#GraphSpaceToScreenSpace(node.Settings.X, node.Settings.Y, node.Settings.Width, node.Settings.Height);

        const roundness = this.Renderer.ThemeSettings.NodeRounding;

        ctx.globalAlpha = node.Settings.Opacity;

        // BASE NODE
        ctx.shadowColor = this.Renderer.ThemeSettings.ShadowColor;
        ctx.shadowBlur = this.Renderer.ThemeSettings.ShadowBlur * this.#TrueViewport.Zoom;

        ctx.fillStyle = this.Renderer.ThemeSettings.NodeColor;
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.width, rect.height, roundness * this.#TrueViewport.Zoom);
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // CLIP EVERYTHING INSIDE NODE
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.width, rect.height, roundness * this.#TrueViewport.Zoom);
        ctx.clip();

        // TOP BAR
        const topBarRect = this.#GraphSpaceToScreenSpace(node.Settings.X, node.Settings.Y, node.Settings.Width, 20);
        ctx.fillStyle = this.Renderer.ThemeSettings.NodeTopBarColor;
        ctx.beginPath();
        ctx.roundRect(topBarRect.x, topBarRect.y, topBarRect.width, topBarRect.height, [roundness * this.#TrueViewport.Zoom, roundness * this.#TrueViewport.Zoom, 0, 0]);
        ctx.fill();

        ctx.globalAlpha = 1;

        ctx.fillStyle = this.Renderer.ThemeSettings.TextColor;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.font = this.Renderer.ThemeSettings.TextSize * this.#TrueViewport.Zoom + "px " + this.Renderer.ThemeSettings.Font;
        ctx.fillText(node.Name, topBarRect.x + topBarRect.height / 3, topBarRect.y + topBarRect.height / 2);

        // BORDER
        ctx.strokeStyle = this.Renderer.ThemeSettings.NodeBorderColor;
        ctx.lineWidth = this.Renderer.ThemeSettings.NodeBorderWidth;
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.width, rect.height, roundness * this.#TrueViewport.Zoom);
        ctx.stroke();

        // RENDER PROPERTIES
        this.#RenderInputs(node);
        this.#RenderOutputs(node);
        this.#RenderStaticValues(node);

        ctx.restore(); // remove clipping
        ctx.globalAlpha = 1;
    }

    #RenderNodes() { this.Nodes.forEach(n => this.#RenderNode(n)); }

    #RenderLinks()
    {   
        for(let i = 0; i < this.Nodes.length; i++)
        {
            const node = this.Nodes[i];

            for(let j = 0; j < node.Out.length; j++)
            {
                const output = node.Out[j];

                for(let k = 0; k < output.LinkedProperties.length; k++)
                {
                    const input = output.LinkedProperties[k];

                    // draw line of the link between properties
                    const outputRect = this.#GraphSpaceToScreenSpace(
                        node.Settings.X,
                        node.Settings.Y + 20 + j * this.Renderer.ThemeSettings.NodePropertyHeight,
                        node.Settings.Width,
                        this.Renderer.ThemeSettings.NodePropertyHeight
                    )
                    const inputRect = this.#GraphSpaceToScreenSpace(
                        input.ParentNode.Settings.X,
                        input.ParentNode.Settings.Y + 20 + input.ParentNode.GetInputIndex(input.Name) * this.Renderer.ThemeSettings.NodePropertyHeight,
                        input.ParentNode.Settings.Width,
                        this.Renderer.ThemeSettings.NodePropertyHeight
                    )

                    const ctx = this.Renderer.Context;

                    const cpOffset = 30; // adjust for curve sharpness
                    const cp1 = { x: outputRect.x + outputRect.width + cpOffset, y: outputRect.y + outputRect.height / 2 };
                    const cp2 = { x: inputRect.x - cpOffset, y: inputRect.y + inputRect.height / 2 };

                    // gradient between start and end color
                    ctx.strokeStyle = ctx.createLinearGradient(cp1.x, cp1.y, cp2.x, cp2.y);
                    ctx.strokeStyle.addColorStop(0, this.Renderer.ThemeSettings.LinkColorOutput);
                    ctx.strokeStyle.addColorStop(1, this.Renderer.ThemeSettings.LinkColorInput);
                    ctx.lineWidth = this.Renderer.ThemeSettings.LinkWidth;

                    ctx.beginPath();
                    ctx.moveTo(outputRect.x + outputRect.width, outputRect.y + outputRect.height / 2);
                    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, inputRect.x, inputRect.y + inputRect.height / 2);
                    ctx.stroke();
                }
            }
        }
    }


    #selectedOutput = null;
    #mousePos = { x: 0, y: 0 };

    #GetHandlePosition(property, index, isOutput)
    {
        const node = property.ParentNode;

        const rect = this.#GraphSpaceToScreenSpace(
            node.Settings.X,
            node.Settings.Y + 20 + index * this.Renderer.ThemeSettings.NodePropertyHeight,
            node.Settings.Width,
            this.Renderer.ThemeSettings.NodePropertyHeight
        );

        return {
            x: isOutput ? rect.x + rect.width : rect.x,
            y: rect.y + rect.height / 2
        };
    }

    #GetHoveredHandle(x, y)
    {
        const radius = 20;

        for (let i = 0; i < this.Nodes.length; i++)
        {
            const node = this.Nodes[i];

            // Outputs
            for (let j = 0; j < node.Out.length; j++)
            {
                const pos = this.#GetHandlePosition(node.Out[j], j, true);
                const dx = x - pos.x;
                const dy = y - pos.y;

                if (dx * dx + dy * dy <= radius * radius)
                    return { type: "output", property: node.Out[j] };
            }

            // Inputs
            for (let j = 0; j < node.In.length; j++)
            {
                const pos = this.#GetHandlePosition(node.In[j], j, false);
                const dx = x - pos.x;
                const dy = y - pos.y;

                if (dx * dx + dy * dy <= radius * radius)
                    return { type: "input", property: node.In[j] };
            }
        }

        return null;
    }

    #RenderLinkPreview() {
        if (!this.#selectedOutput) return;

        const ctx = this.Renderer.Context;
        const output = this.#selectedOutput;
        const index = output.ParentNode.Out.indexOf(output);

        const start = this.#GetHandlePosition(output, index, true);
        const end = this.#mousePos;

        // Determine control points (offset horizontally)
        const cpOffset = 30; // adjust for curve sharpness
        const cp1 = { x: start.x + cpOffset, y: start.y };
        const cp2 = { x: end.x - cpOffset, y: end.y };

        ctx.strokeStyle = this.Renderer.ThemeSettings.LinkColorPreview;
        ctx.lineWidth = this.Renderer.ThemeSettings.LinkWidth;

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
        ctx.stroke();
    }

    #LinkFunctionality()
    {
        const canvas = this.Renderer.Canvas;

        canvas.addEventListener("mousedown", e => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const hovered = this.#GetHoveredHandle(x, y);

            if (hovered && hovered.type === "output")
            {
                this.#selectedOutput = hovered.property;
            }

            if (hovered && hovered.type === "input")
            {
                this.#selectedOutput = hovered.property.LinkedProperty;
                hovered.property.LinkedProperty.LinkedProperties.splice(hovered.property.LinkedProperty.LinkedProperties.indexOf(hovered.property), 1);
                hovered.property.LinkedProperty = null;
            }
        });

        canvas.addEventListener("mouseup", e => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const hovered = this.#GetHoveredHandle(x, y);

            if (this.#selectedOutput && hovered && hovered.type === "input")
            {
                this.#selectedOutput.Link(hovered.property);
            }

            this.#selectedOutput = null;
        });

        canvas.addEventListener("mousemove", e => {
            const rect = canvas.getBoundingClientRect();
            this.#mousePos.x = e.clientX - rect.left;
            this.#mousePos.y = e.clientY - rect.top;
        });
    }

    #InputsUpdate() {
        const t = this.Renderer.ThemeSettings.Interpolation * this.DeltaTime;
        this.#TrueViewport.Zoom = this.#lerp(this.#TrueViewport.Zoom, this.Renderer.Viewport.Zoom, t);
        this.#TrueViewport.X = this.#lerp(this.#TrueViewport.X, this.Renderer.Viewport.X, t);
        this.#TrueViewport.Y = this.#lerp(this.#TrueViewport.Y, this.Renderer.Viewport.Y, t);
    }

    DeltaTime = 0;

    #lastUpdate = Date.now();

    UpdateNodes()
    {
        for (let i = 0; i < this.Nodes.length; i++)
        {
            this.Nodes[i].Update();
        }
    }

    #RenderUI() {
        const ctx = this.Renderer.Context; // your canvas 2D context
        const canvas = this.Renderer.Canvas;

        // Save current state
        ctx.save();

        // UI settings
        const margin = 20;       // distance from edges
        const iconSize = 20;     // size of the trash icon
        const x = margin;
        const y = canvas.height - iconSize - margin;

        // Trash icon path (from your SVG)
        const trashPath = new Path2D("M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5M8 5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7A.5.5 0 0 1 8 5m3 .5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 1 0");

        // Scale to fit icon size
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(iconSize / 16, iconSize / 16); // SVG viewBox is 16x16
        ctx.fillStyle = this.#trashingNode ? this.Renderer.ThemeSettings.ValueChangingColor : this.Renderer.ThemeSettings.GridColor;
        ctx.fill(trashPath);
        ctx.restore();
    }

    #OnUpdate() {
        this.DeltaTime = (Date.now() - this.#lastUpdate) / 1000.0;
        this.#lastUpdate = Date.now();

        requestAnimationFrame(this.#OnUpdate.bind(this));
        this.#InputsUpdate();
        this.#ClearCanvas();
        
        this.#RenderNodes();
        this.#RenderLinks();
        this.#RenderLinkPreview();

        this.#RenderUI();
    }

    #draggingNode = null;
    #nodeDragOffset = { x: 0, y: 0 };
    #resizingNode = null;
    #nodeResizeStart = { x: 0, y: 0, width: 0, height: 0 };

    #editingStaticValue = null;

    #EditStaticValue(staticValue)
    {
        this.#editingStaticValue = staticValue;

        // create input element on the position

        // get static value rect
        const node = staticValue.Node;
        const staticValueRect = this.#GraphSpaceToScreenSpace(
            node.Settings.X,
            node.Settings.Y + 20 + Math.max(node.Out.length, node.In.length) * this.Renderer.ThemeSettings.NodePropertyHeight + node.StaticValues.indexOf(staticValue) * this.Renderer.ThemeSettings.NodePropertyHeight,
            node.Settings.Width,
            this.Renderer.ThemeSettings.NodePropertyHeight
        )

        // create input element
        const inputElement = document.createElement("input");
        switch (staticValue.Type)
        {
            case "float":
                inputElement.type = "number";
                break;
            case "string":
                inputElement.type = "text";
                break;
            case "bool":
                inputElement.type = "checkbox";
                break;
            case "any":
                inputElement.type = "text";
                break;
        }
        inputElement.value = staticValue.Value;
        inputElement.style.position = "absolute";
        inputElement.style.left = staticValueRect.x + "px";
        inputElement.style.top = staticValueRect.y + "px";
        inputElement.style.width = staticValueRect.width + "px";
        inputElement.style.height = staticValueRect.height + "px";
        inputElement.style.fontSize = this.Renderer.ThemeSettings.TextSize * this.Renderer.Viewport.Zoom + "px";
        inputElement.style.fontFamily = this.Renderer.ThemeSettings.Font;
        inputElement.style.color = this.Renderer.ThemeSettings.TextColor;
        inputElement.style.boxSizing = "border-box";
        inputElement.style.margin = "0";
        inputElement.style.padding = "0";
        inputElement.style.background = "transparent";
        inputElement.style.textAlign = "right";
        inputElement.style.border = "none";
        inputElement.style.outline = "none";
        inputElement.style.paddingRight = staticValueRect.height / 3 + "px";
        inputElement.style.borderBottom = "1px solid " + this.Renderer.ThemeSettings.ValueChangingColor;

        // handle input
        inputElement.addEventListener("input", e => {
            staticValue.Value = e.target.value;
        });
        inputElement.addEventListener("blur", e => {
            this.#editingStaticValue = null;
            inputElement.remove();
        });

        document.body.appendChild(inputElement);
    }

    #trashingNode = null;

    #InputsConfigure() {
        const canvas = this.Renderer.Canvas;
        const viewport = this.Renderer.Viewport;

        let isPanning = false;
        let panStart = { x: 0, y: 0 };
        let viewportStart = { x: 0, y: 0 };

        const resizeHandleSize = 10;

        const getMouseGraphPos = (e) => ({
            x: viewport.X + e.offsetX / viewport.Zoom,
            y: viewport.Y + e.offsetY / viewport.Zoom
        });

        const updateCursor = (e) => {
            const mousePos = getMouseGraphPos(e);

            // Check nodes from topmost to bottom
            for (let i = this.Nodes.length - 1; i >= 0; i--) {
                const node = this.Nodes[i];
                const { X, Y, Width, Height } = node.Settings;

                // Resize handle bottom-right
                if (mousePos.x >= X + Width - resizeHandleSize && mousePos.x <= X + Width &&
                    mousePos.y >= Y + Height - resizeHandleSize && mousePos.y <= Y + Height) {
                    canvas.style.cursor = "se-resize";
                    return;
                }

                // Top bar drag
                if (mousePos.x >= X && mousePos.x <= X + Width &&
                    mousePos.y >= Y && mousePos.y <= Y + 20) {
                    canvas.style.cursor = "move";
                    return;
                }
            }

            // Middle mouse panning or default
            canvas.style.cursor = "default";
        };

        canvas.addEventListener('mousemove', e => {
            updateCursor(e);

            const mousePos = getMouseGraphPos(e);

            if(this.#editingStaticValue) return;

            // Node dragging
            if (this.#draggingNode) {
                this.#draggingNode.Settings.X = mousePos.x - this.#nodeDragOffset.x;
                this.#draggingNode.Settings.Y = mousePos.y - this.#nodeDragOffset.y;

                const ssRect = this.#GraphSpaceToScreenSpace(this.#draggingNode.Settings.X, this.#draggingNode.Settings.Y, this.#draggingNode.Settings.Width, this.#draggingNode.Settings.Height);
                if(ssRect.x < 100 && ssRect.y > canvas.height - 100) this.#trashingNode = this.#draggingNode;
                else this.#trashingNode = null;
                return;
            }

            // Node resizing
            if (this.#resizingNode) {
                const deltaX = mousePos.x - this.#nodeResizeStart.x;
                const deltaY = mousePos.y - this.#nodeResizeStart.y;
                this.#resizingNode.Settings.Width = Math.max(20, this.#nodeResizeStart.width + deltaX);
                this.#resizingNode.Settings.Height = Math.max(20, this.#nodeResizeStart.height + deltaY);
                return;
            }

            // Panning
            if (isPanning) {
                const dx = (e.clientX - panStart.x) / viewport.Zoom;
                const dy = (e.clientY - panStart.y) / viewport.Zoom;
                viewport.X = viewportStart.x - dx;
                viewport.Y = viewportStart.y - dy;
            }
        });

        canvas.addEventListener('mousedown', e => {
            const mousePos = getMouseGraphPos(e);

            // Nodes
            for (let i = this.Nodes.length - 1; i >= 0; i--) {
                const node = this.Nodes[i];
                const { X, Y, Width, Height } = node.Settings;

                if (mousePos.x >= X + Width - resizeHandleSize && mousePos.x <= X + Width &&
                    mousePos.y >= Y + Height - resizeHandleSize && mousePos.y <= Y + Height) {

                    this.#resizingNode = node;
                    this.#nodeResizeStart = {
                        x: mousePos.x,
                        y: mousePos.y,
                        width: Width,
                        height: Height
                    };
                    return;
                }

                if (mousePos.x >= X && mousePos.x <= X + Width &&
                    mousePos.y >= Y && mousePos.y <= Y + 20) {

                    this.#draggingNode = node;
                    this.#nodeDragOffset.x = mousePos.x - X;
                    this.#nodeDragOffset.y = mousePos.y - Y;

                    this.Nodes.splice(i, 1);
                    this.Nodes.push(node);
                    return;
                }
            }

            if (e.button === 1) {
                isPanning = true;
                panStart = { x: e.clientX, y: e.clientY };
                viewportStart = { x: viewport.X, y: viewport.Y };
            }

            if (e.button === 2)
            {
                e.preventDefault();
                this.#OpenContextMenu(e.offsetX, e.offsetY);
            }
            else {
                this.#CloseContextMenu();
            }
        });

        window.addEventListener('mouseup', () => {
            this.#draggingNode = null;
            this.#resizingNode = null;
            isPanning = false;

            if (this.#trashingNode) {
                this.#trashingNode.Delete();
                this.#trashingNode = null;
            }
        });

        window.addEventListener('dblclick', (e) => {
            if (this.#editingStaticValue) return;

            // Convert mouse to graph space
            const mouseGraphX = this.Renderer.Viewport.X + e.offsetX / this.Renderer.Viewport.Zoom;
            const mouseGraphY = this.Renderer.Viewport.Y + e.offsetY / this.Renderer.Viewport.Zoom;

            for (let i = 0; i < this.Nodes.length; i++) {
                const node = this.Nodes[i];

                let stackedIndex = 0; // for layout of non-bypassed static values
                for (let k = 0; k < node.StaticValues.length; k++) {
                    const staticValue = node.StaticValues[k];

                    // Determine y position
                    let yOffset;
                    if (staticValue.Settings.BypassPreviousLayout) {
                        // place above normal layout, or you could define a custom y in Settings if needed
                        yOffset = 20 + stackedIndex * 0; // could also be staticValue.Settings.CustomY
                    } else {
                        // normal stacked layout
                        yOffset = 20 + Math.max(node.Out.length, node.In.length) * this.Renderer.ThemeSettings.NodePropertyHeight + stackedIndex * this.Renderer.ThemeSettings.NodePropertyHeight;
                        stackedIndex++;
                    }

                    const staticValueRect = {
                        x: node.Settings.X,
                        y: node.Settings.Y + yOffset,
                        width: node.Settings.Width,
                        height: this.Renderer.ThemeSettings.NodePropertyHeight
                    };

                    if (
                        mouseGraphX >= staticValueRect.x &&
                        mouseGraphX <= staticValueRect.x + staticValueRect.width &&
                        mouseGraphY >= staticValueRect.y &&
                        mouseGraphY <= staticValueRect.y + staticValueRect.height &&
                        !staticValue.Settings.ReadOnly
                    ) {
                        this.#EditStaticValue(staticValue);
                    }
                }
            }
        });

        // Zoom (existing code)
        canvas.addEventListener('wheel', e => {
            if(this.#editingStaticValue) return;

            e.preventDefault();
            const zoomFactor = 1.1;
            const newZoom = e.deltaY < 0 ? viewport.Zoom * zoomFactor : viewport.Zoom / zoomFactor;
            const clampedZoom = Math.max(0.1, Math.min(10, newZoom));

            const mouseX = e.offsetX;
            const mouseY = e.offsetY;
            const worldX = viewport.X + mouseX / viewport.Zoom;
            const worldY = viewport.Y + mouseY / viewport.Zoom;

            viewport.Zoom = clampedZoom;
            viewport.X = worldX - mouseX / viewport.Zoom;
            viewport.Y = worldY - mouseY / viewport.Zoom;
        }, { passive: false });

        this.#LinkFunctionality();
    }

    #RenderContextMenu(contextMenu, x, y)
    {
        contextMenu.innerHTML = '';
        
        // add input for search bar
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.id = 'nodely-context-menu-search';
        searchInput.placeholder = 'Search nodes...';
        searchInput.style.width = '100%';
        searchInput.style.padding = '10px';
        searchInput.style.border = 'none';
        searchInput.style.background = this.Renderer.ThemeSettings.ContextMenuBackgroundColor;
        searchInput.style.color = this.Renderer.ThemeSettings.TextColor;
        searchInput.style.cursor = 'text';
        searchInput.style.textAlign = 'left';
        searchInput.style.fontSize = '15px';
        searchInput.style.fontFamily = this.Renderer.ThemeSettings.Font;
        searchInput.style.outline = 'none';
        searchInput.style.borderBottom = this.Renderer.ThemeSettings.ContextMenuBorderWidth + 'px solid ' + this.Renderer.ThemeSettings.ContextMenuBorderColor;

        searchInput.addEventListener('input', function()
        {
            contextMenu.setAttribute('data-filter', searchInput.value);
            this.#RenderContextMenu(contextMenu, x, y);
            document.querySelector('#nodely-context-menu-search').value = searchInput.value;
            document.querySelector('#nodely-context-menu-search').focus();
        }.bind(this));
        contextMenu.appendChild(searchInput);

        // add a button for each node in the registry
        for(let i = 0; i < NodeRegistry.GetAll().length; i++) {
            // gets the class, not an object
            const node = NodeRegistry.GetAll()[i];
            var nodeName = node.name;
            // Remove "Node" suffix if present
            if (nodeName.endsWith('Node')) nodeName = nodeName.substring(0, nodeName.length - 4);

            // Split by uppercase letters and join with spaces
            nodeName = nodeName.replace(/([a-z])([A-Z])/g, '$1 $2');

            // search filter
            if (contextMenu.getAttribute('data-filter')) {
                if (!nodeName.toLowerCase().includes(contextMenu.getAttribute('data-filter').toLowerCase())) continue;
            }

            // use standard node styling for the button
            const button = document.createElement('button');
            button.style.width = '100%';
            button.style.padding = '10px';
            button.style.border = 'none';
            button.style.background = this.Renderer.ThemeSettings.ContextMenuBackgroundColor;
            button.style.color = this.Renderer.ThemeSettings.TextColor;
            button.style.cursor = 'pointer';
            button.style.textAlign = 'left';
            button.style.fontSize = '15px';
            button.style.fontFamily = this.Renderer.ThemeSettings.Font;
            button.style.outline = 'none';
            button.style.borderBottom = this.Renderer.ThemeSettings.ContextMenuBorderWidth + 'px solid ' + this.Renderer.ThemeSettings.ContextMenuBorderColor;

            button.innerText = nodeName;

            button.addEventListener('click', () => {
                const n = new node();
                const pos = this.#ScreenSpaceToGraphSpace(x, y);
                n.Settings.X = pos.x;
                n.Settings.Y = pos.y;
                this.AddNode(n);
                this.#CloseContextMenu();
            });

            contextMenu.appendChild(button);
        }
    }

    #OpenContextMenu(x, y)
    {
        document.querySelectorAll('#context-menu').forEach(m => m.remove());

        const contextMenu = document.createElement('div');
        contextMenu.id = 'context-menu';
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
        contextMenu.style.width = this.Renderer.ThemeSettings.ContextMenuWidth + 'px';
        contextMenu.style.height = this.Renderer.ThemeSettings.ContextMenuHeight + 'px';
        contextMenu.style.position = 'absolute';
        contextMenu.style.background = this.Renderer.ThemeSettings.ContextMenuBackgroundColor;
        contextMenu.style.backdropFilter = 'blur(5px)';
        contextMenu.style.border = this.Renderer.ThemeSettings.ContextMenuBorderWidth + 'px solid ' + this.Renderer.ThemeSettings.ContextMenuBorderColor;
        contextMenu.style.padding = 0;
        contextMenu.style.borderRadius = this.Renderer.ThemeSettings.ContextMenuRounding + 'px';
        contextMenu.style.overflow = 'hidden';
        contextMenu.style.overflowY = 'scroll';
        contextMenu.style.zIndex = 1000;
        contextMenu.style.opacity = 0;

        setTimeout(() => contextMenu.style.opacity = 1, 0);

        contextMenu.style.boxShadow = '0px 0px ' + this.Renderer.ThemeSettings.ShadowBlur + "px " + this.Renderer.ThemeSettings.ShadowColor;

        this.#RenderContextMenu(contextMenu, x, y);

        document.body.appendChild(contextMenu);
        document.querySelector('#nodely-context-menu-search').focus();
    }

    #CloseContextMenu()
    {
        document.querySelectorAll('#context-menu').forEach(function(m)
        {
            m.style.opacity = 0;
            setTimeout(() => m.remove(), 200);
        }); 
    }

    UpdateCanvas() {
        const rect = this.Renderer.Canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // Set actual pixel resolution
        this.Renderer.Canvas.width = rect.width * dpr;
        this.Renderer.Canvas.height = rect.height * dpr;

        // Keep CSS size unchanged
        this.Renderer.Canvas.style.width = rect.width + "px";
        this.Renderer.Canvas.style.height = rect.height + "px";

        // Store logical size (not scaled)
        this.Renderer.Width = rect.width;
        this.Renderer.Height = rect.height;

        // Scale drawing context so everything matches
        this.Renderer.Context.setTransform(dpr, 0, 0, dpr, 0, 0);

        requestAnimationFrame(this.#OnUpdate.bind(this));
    }

    LinkCanvas(canvas) {
        this.Renderer.Canvas = canvas;
        this.Renderer.Context = canvas.getContext('2d');
        canvas.oncontextmenu = (e) => e.preventDefault();
        this.UpdateCanvas();
        window.addEventListener('resize', this.UpdateCanvas.bind(this));
        this.#InputsConfigure();

        // Center world origin by default
        this.Renderer.Viewport.X = -this.Renderer.Width / 2 / this.Renderer.Viewport.Zoom;
        this.Renderer.Viewport.Y = -this.Renderer.Height / 2 / this.Renderer.Viewport.Zoom;

        return canvas;
    }

    constructor() {}
}

class NumberNode extends Node
{
    outputValue = new NodeOutput('Output', this, 'float');
    constructor()
    {
        super('Number');
        this.Out = [
            this.outputValue
        ]

        this.StaticValues = [
            new StaticValue('Value', 0, this, 'float')
        ]
    }

    Update()
    {
        this.outputValue.GetValue = function()
        {
            return this.ParentNode.GetStaticValue('Value');
        }
    }
}

class StringNode extends Node
{
    outputValue = new NodeOutput('Output', this, 'string');
    constructor()
    {
        super('String');
        this.Out = [
            this.outputValue
        ]

        this.StaticValues = [
            new StaticValue('Value', '', this, 'string')
        ]
    }

    Update()
    {
        this.outputValue.GetValue = function()
        {
            return this.ParentNode.GetStaticValue('Value');
        }
    }
}

class AddNode extends Node
{
    Explanation = new StaticValue('Explanation', 'A + B', this, 'string')
    constructor()
    {
        super('Add (+)');
        this.In = [
            new NodeInput('A', this, 'float|color'),
            new NodeInput('B', this, 'float|color')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'float|color')
        ]

        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;

        this.StaticValues = [
            this.Explanation
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return parseFloat(this.ParentNode.GetInputValue('A')) + parseFloat(this.ParentNode.GetInputValue('B'))
        }
    }
}

class SubtractNode extends Node
{
    Explanation = new StaticValue('Explanation', 'A - B', this, 'string')
    constructor()
    {
        super('Subtract (-)');
        this.In = [
            new NodeInput('A', this, 'float'),
            new NodeInput('B', this, 'float')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'float')
        ]

        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;

        this.StaticValues = [
            this.Explanation
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return parseFloat(this.ParentNode.GetInputValue('A')) - parseFloat(this.ParentNode.GetInputValue('B'));
        }
    }
}

class MultiplyNode extends Node
{
    Explanation = new StaticValue('Explanation', 'A * B', this, 'string')
    constructor()
    {
        super('Multiply (×)');
        this.In = [
            new NodeInput('A', this, 'float'),
            new NodeInput('B', this, 'float')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'float')
        ]

        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;

        this.StaticValues = [
            this.Explanation
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return parseFloat(this.ParentNode.GetInputValue('A')) * parseFloat(this.ParentNode.GetInputValue('B'));
        }
    }
}

class DivideNode extends Node
{
    Explanation = new StaticValue('Explanation', 'A ÷ B', this, 'string')
    constructor()
    {
        super('Divide (÷)');
        this.In = [
            new NodeInput('A', this, 'float'),
            new NodeInput('B', this, 'float')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'float')
        ]

        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;

        this.StaticValues = [
            this.Explanation
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return parseFloat(this.ParentNode.GetInputValue('A')) / parseFloat(this.ParentNode.GetInputValue('B'));
        }
    }
}

class DisplayNode extends Node
{
    displayValue = new StaticValue('Value', 0, this, 'any')
    constructor()
    {
        super('Display');
        this.In = [
            new NodeInput('Input', this, 'any')
        ]

        this.displayValue.Settings.ReadOnly = true;
        this.displayValue.Settings.HideValueName = true;

        this.StaticValues = [
            this.displayValue
        ]
    }

    Update()
    {
        this.displayValue.Value = this.GetInputValue('Input');
    }
}

class GreaterThanNode extends Node
{
    Explanation = new StaticValue('Explanation', 'A > B', this, 'string');
    constructor()
    {
        super('Greater Than (>)');
        this.In = [
            new NodeInput('A', this, 'float'),
            new NodeInput('B', this, 'float')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'bool')
        ]

        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;

        this.StaticValues = [
            this.Explanation
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return parseFloat(this.ParentNode.GetInputValue('A')) > parseFloat(this.ParentNode.GetInputValue('B'));
        }
    }
}

class LessThanNode extends Node
{
    Explanation = new StaticValue('Explanation', 'A < B', this, 'string');
    constructor()
    {
        super('Less Than (<)');
        this.In = [
            new NodeInput('A', this, 'float'),
            new NodeInput('B', this, 'float')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'bool')
        ]

        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;

        this.StaticValues = [
            this.Explanation
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return parseFloat(this.ParentNode.GetInputValue('A')) < parseFloat(this.ParentNode.GetInputValue('B'));
        }
    }
}

class EqualsNode extends Node
{
    Explanation = new StaticValue('Explanation', 'A == B', this, 'string');
    constructor()
    {
        super('Equals (==)');
        this.In = [
            new NodeInput('A', this, 'any'),
            new NodeInput('B', this, 'any')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'bool')
        ]

        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;

        this.StaticValues = [
            this.Explanation
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return this.ParentNode.GetInputValue('A') == this.ParentNode.GetInputValue('B');
        }
    }
}

class NotNode extends Node
{
    Explanation = new StaticValue('Explanation', '!A', this, 'string');
    constructor()
    {
        super('Not (!)');
        this.In = [
            new NodeInput('A', this, 'bool')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'bool')
        ]

        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;

        this.StaticValues = [
            this.Explanation
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return !this.ParentNode.GetInputValue('A');
        }
    }
}

class AndNode extends Node
{
    Explanation = new StaticValue('Explanation', 'A && B', this, 'string');
    constructor()
    {
        super('And (&&)');
        this.In = [
            new NodeInput('A', this, 'bool'),
            new NodeInput('B', this, 'bool')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'bool')
        ]

        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;

        this.StaticValues = [
            this.Explanation
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return this.ParentNode.GetInputValue('A') && this.ParentNode.GetInputValue('B');
        }
    }
}

class OrNode extends Node
{
    Explanation = new StaticValue('Explanation', 'A || B', this, 'string');
    constructor()
    {
        super('Or (||)');
        this.In = [
            new NodeInput('A', this, 'bool'),
            new NodeInput('B', this, 'bool')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'bool')
        ]

        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;

        this.StaticValues = [
            this.Explanation
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return this.ParentNode.GetInputValue('A') || this.ParentNode.GetInputValue('B');
        }
    }
}

class ActionNode extends Node
{
    constructor(name)
    {
        super(name)

        this.In = [
            new NodeInput('->', this, 'action')
        ]

        this.Out = []
    }

    Action() { }
}

class ConsoleLogNode extends ActionNode
{
    constructor()
    {
        super('Console Log');
        this.In.push(new NodeInput('Message', this, 'any'));
    }

    Action()
    {
        console.log(this.GetInputValue('Message'));
    }
}

class ConditionNode extends Node
{
    constructor()
    {
        super('Condition');
        this.In = [
            new NodeInput('Condition', this, 'bool'),
        ]

        this.Out = [
            new NodeOutput('If', this, 'action'),
            new NodeOutput('Else', this, 'action')
        ]
    }

    Update()
    {
        if(this.GetInputValue('Condition'))
        {
            for(let i = 0; i < this.Out[0].LinkedProperties.length; i++)
            {
                this.Out[0].LinkedProperties[i].ParentNode.Action();
            }
        }
        else
        {
            for(let i = 0; i < this.Out[1].LinkedProperties.length; i++)
            {
                this.Out[1].LinkedProperties[i].ParentNode.Action();
            }
        }
    }
}

class SwitchNode extends Node
{
    constructor()
    {
        super('Switch');
        this.In = [
            new NodeInput('Condition', this, 'bool'),
            new NodeInput('A', this, 'any'),
            new NodeInput('B', this, 'any')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'any'),
        ]
    }

    Update()
    {
        if(this.GetInputValue('Condition'))
        {
            this.Out[0].GetValue = function()
            {
                return this.ParentNode.GetInputValue('A');
            }
        }
        else
        {
            this.Out[0].GetValue = function()
            {
                return this.ParentNode.GetInputValue('B');
            }
        }
    }
}

class TrueNode extends Node
{
    constructor()
    {
        super('True');

        this.Out = [
            new NodeOutput('Output', this, 'bool')
        ]

        const trueValue = new StaticValue('Value', true, this, 'bool');
        trueValue.Settings.ReadOnly = true;
        trueValue.Settings.HideValueName = true;
        this.StaticValues = [
            trueValue
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return true;
        }
    }
}

class FalseNode extends Node
{
    constructor()
    {
        super('False');

        this.Out = [
            new NodeOutput('Output', this, 'bool')
        ]

        const falseValue = new StaticValue('Value', false, this, 'bool');
        falseValue.Settings.ReadOnly = true;
        falseValue.Settings.HideValueName = true;
        this.StaticValues = [
            falseValue
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return false;
        }
    }
}

class Texture 
{
    constructor(sampleFn)
    {
        this.Sample = sampleFn // (u, v) => { return [r, g, b, a] }
    }
}

class TextureNode extends Node {
    constructor() {
        super('Texture');

        this.StaticValues = [
            new StaticValue('Path', '', this, 'string')
        ];

        this.Out = [
            new NodeOutput('Output', this, 'texture')
        ];
    }

    Update() {
        const path = this.GetStaticValue('Path');

        this.Out[0].GetValue = () => {
            return {
                Path: path,
                IsImage: true,

                // placeholder sampler (real one will be handled later)
                Sample: null
            };
        };
    }
}

class Sampler2DNode extends Node {
    constructor() {
        super('Sampler2D');

        this.In = [
            new NodeInput('Texture', this, 'texture')
        ];

        this.Out = [
            new NodeOutput('Output', this, 'texture')
        ];
    }

    Update() {
        const tex = this.GetInputValue('Texture');

        this.Out[0].GetValue = () => {
            if (!tex) return null;

            // If it's procedural already → pass through
            if (tex.Sample) {
                return tex;
            }

            // If it's an image → create a sampler wrapper
            if (tex.Path) {
                return {
                    Path: tex.Path,
                    IsImage: true,

                    // sampling handled later in MaterialOutputNode
                    Sample: null
                };
            }

            return null;
        };
    }
}

class NoiseNode extends Node {
    constructor() {
        super('Noise');

        this.In = [
            new NodeInput('Scale', this, 'float', 5)
        ];

        this.Out = [
            new NodeOutput('Output', this, 'texture')
        ];

        // permutation table (fixed = stable noise)
        this.p = new Uint8Array(512);
        const perm = [];
        for (let i = 0; i < 256; i++) perm[i] = i;

        // shuffle
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [perm[i], perm[j]] = [perm[j], perm[i]];
        }

        for (let i = 0; i < 512; i++) {
            this.p[i] = perm[i % 256];
        }
    }

    Update() {
        const scale = this.GetInputValue('Scale');

        this.Out[0].GetValue = () => {
            return {
                Sample: (u, v) => {
                    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
                    const lerp = (a, b, t) => a + t * (b - a);
                    const grad = (hash, x, y) => {
                        const h = hash & 3;
                        return ((h & 1) ? x : -x) + ((h & 2) ? y : -y);
                    };

                    let x = u * scale;
                    let y = v * scale;

                    const X = Math.floor(x) & 255;
                    const Y = Math.floor(y) & 255;

                    x -= Math.floor(x);
                    y -= Math.floor(y);

                    const uFade = fade(x);
                    const vFade = fade(y);

                    const A = this.p[X] + Y;
                    const B = this.p[X + 1] + Y;

                    const noise = lerp(
                        lerp(grad(this.p[A], x, y), grad(this.p[B], x - 1, y), uFade),
                        lerp(grad(this.p[A + 1], x, y - 1), grad(this.p[B + 1], x - 1, y - 1), uFade),
                        vFade
                    );

                    const val = (noise + 1) / 2;

                    return [val, val, val, 1]; // RGBA
                }
            };
        };
    }
}

class MaterialNode extends Node
{
    constructor()
    {
        super('Material');
        this.In = [
            new NodeInput('Diffuse', this, 'color|texture', [1, 1, 1]),
            new NodeInput('Specular', this, 'color|texture', [1, 1, 1]),
            new NodeInput('Specular Intensity', this, 'float', 1),
            new NodeInput('Roughness', this, 'float', 1),
            new NodeInput('Opacity', this, 'float', 1)
        ]

        this.Out = [
            new NodeOutput('Output', this, 'material')
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return {
                diffuse: this.ParentNode.GetInputValue('Diffuse'),
                specular: this.ParentNode.GetInputValue('Specular'),
                specularIntensity: this.ParentNode.GetInputValue('Specular Intensity'),
                roughness: this.ParentNode.GetInputValue('Roughness'),
                opacity: this.ParentNode.GetInputValue('Opacity')
            }
        }
    }
}

class MaterialOutputNode extends Node
{
    threeMaterialReference;
    // the "THREE" object
    threeReference;
    constructor(threeMaterialReference, threeReference)
    {
        super('Material Output');
        this.In = [
            new NodeInput('Material', this, 'material')
        ]
        this.threeMaterialReference = threeMaterialReference
        this.threeReference = threeReference

        this.textureLoader = new this.threeReference.TextureLoader();

        this.textureCache = {};
    }

    textureLoader;

    Update() {
        const mat = this.GetInputValue('Material');
        if (!mat) return;

        const diffuse = mat.diffuse;

        // --- PROCEDURAL TEXTURE ---
        if (diffuse && diffuse.Sample) {
            const size = 256;
            const data = new Uint8Array(size * size * 3);

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const u = x / size;
                    const v = y / size;

                    const color = diffuse.Sample(u, v);

                    const i = (y * size + x) * 3;
                    data[i] = color[0] * 255;
                    data[i + 1] = color[1] * 255;
                    data[i + 2] = color[2] * 255;
                }
            }

            const texture = new this.threeReference.DataTexture(
                data,
                size,
                size,
                this.threeReference.RGBFormat
            );

            texture.needsUpdate = true;

            this.threeMaterialReference.map = texture;
            this.threeMaterialReference.needsUpdate = true;

            return;
        }

        // --- IMAGE TEXTURE ---
        if (diffuse && diffuse.Path) {
            if (!this.textureCache[diffuse.Path]) {
                this.textureCache[diffuse.Path] = this.textureLoader.load(diffuse.Path, () => {
                    this.threeMaterialReference.needsUpdate = true;
                });
            }

            this.threeMaterialReference.map = this.textureCache[diffuse.Path];
            return;
        }

        // --- COLOR ---
        if (Array.isArray(diffuse)) {
            this.threeMaterialReference.color =
                new this.threeReference.Color(diffuse[0], diffuse[1], diffuse[2]);
        }
    }
}

class ColorNode extends Node
{
    Explanation = new StaticValue('Explanation', '(0-255)', this, 'string')
    constructor()
    {
        super('Color');
        
        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;

        this.In = [

        ]

        const rstatic = new StaticValue('R', 255, this, 'float');
        const gstatic = new StaticValue('G', 255, this, 'float');
        const bstatic = new StaticValue('B', 255, this, 'float');

        this.StaticValues = [
            rstatic,
            gstatic,
            bstatic,
            this.Explanation
        ]

        this.Out = [
            new NodeOutput('Output', this, 'color')
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return [
                this.ParentNode.GetStaticValue('R') / 255,
                this.ParentNode.GetStaticValue('G') / 255,
                this.ParentNode.GetStaticValue('B') / 255,
            ]
        }
    }
}

class ColorMultiplyNode extends Node
{
    Explanation = new StaticValue('Explanation', 'A * B', this, 'string')
    constructor()
    {
        super('Color Multiply (x)');
        this.In = [
            new NodeInput('A', this, 'color'),
            new NodeInput('B', this, 'color')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'color')
        ]

        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;
        this.StaticValues = [
            this.Explanation
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return [
                this.ParentNode.GetInputValue('A')[0] * this.ParentNode.GetInputValue('B')[0],
                this.ParentNode.GetInputValue('A')[1] * this.ParentNode.GetInputValue('B')[1],
                this.ParentNode.GetInputValue('A')[2] * this.ParentNode.GetInputValue('B')[2],
            ]
        }
    }
}

class ColorDivideNode extends Node
{
    Explanation = new StaticValue('Explanation', 'A ÷ B', this, 'string')
    constructor()
    {
        super('Color Divide (÷)');
        this.In = [
            new NodeInput('A', this, 'color'),
            new NodeInput('B', this, 'color')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'color')
        ]

        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;
        this.StaticValues = [
            this.Explanation
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return [
                this.ParentNode.GetInputValue('A')[0] / this.ParentNode.GetInputValue('B')[0],
                this.ParentNode.GetInputValue('A')[1] / this.ParentNode.GetInputValue('B')[1],
                this.ParentNode.GetInputValue('A')[2] / this.ParentNode.GetInputValue('B')[2],
            ]
        }
    }
}

class ColorAddNode extends Node
{
    Explanation = new StaticValue('Explanation', 'A + B', this, 'string')
    constructor()
    {
        super('Color Add (+)');
        this.In = [
            new NodeInput('A', this, 'color'),
            new NodeInput('B', this, 'color')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'color')
        ]

        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;
        this.StaticValues = [
            this.Explanation
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return [
                this.ParentNode.GetInputValue('A')[0] + this.ParentNode.GetInputValue('B')[0],
                this.ParentNode.GetInputValue('A')[1] + this.ParentNode.GetInputValue('B')[1],
                this.ParentNode.GetInputValue('A')[2] + this.ParentNode.GetInputValue('B')[2],
            ]
        }
    }
}

class ColorSubtractNode extends Node
{
    Explanation = new StaticValue('Explanation', 'A - B', this, 'string')
    constructor()
    {
        super('Color Subtract (+)');
        this.In = [
            new NodeInput('A', this, 'color'),
            new NodeInput('B', this, 'color')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'color')
        ]

        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;
        this.StaticValues = [
            this.Explanation
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return [
                this.ParentNode.GetInputValue('A')[0] - this.ParentNode.GetInputValue('B')[0],
                this.ParentNode.GetInputValue('A')[1] - this.ParentNode.GetInputValue('B')[1],
                this.ParentNode.GetInputValue('A')[2] - this.ParentNode.GetInputValue('B')[2],
            ]
        }
    }
}

class ColorMixNode extends Node
{
    Explanation = new StaticValue('Explanation', 'A * (1 - Mix) + B * Mix', this, 'string')
    constructor()
    {
        super('Color Mix');
        this.In = [
            new NodeInput('A', this, 'color'),
            new NodeInput('B', this, 'color'),
            new NodeInput('Mix', this, 'float')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'color')
        ]

        this.Explanation.Settings.ReadOnly = true;
        this.Explanation.Settings.HideValueName = true;
        this.StaticValues = [
            this.Explanation
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return [
                this.ParentNode.GetInputValue('A')[0] * (1 - this.ParentNode.GetInputValue('Mix')) + this.ParentNode.GetInputValue('B')[0] * this.ParentNode.GetInputValue('Mix'),
                this.ParentNode.GetInputValue('A')[1] * (1 - this.ParentNode.GetInputValue('Mix')) + this.ParentNode.GetInputValue('B')[1] * this.ParentNode.GetInputValue('Mix'),
                this.ParentNode.GetInputValue('A')[2] * (1 - this.ParentNode.GetInputValue('Mix')) + this.ParentNode.GetInputValue('B')[2] * this.ParentNode.GetInputValue('Mix'),
            ]
        }
    }
}

class SinNode extends Node
{
    constructor()
    {
        super('Sin');
        this.In = [
            new NodeInput('A', this, 'float')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'float')
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return Math.sin(this.ParentNode.GetInputValue('A'));
        }
    }
}

class CosNode extends Node
{
    constructor()
    {
        super('Cos');
        this.In = [
            new NodeInput('A', this, 'float')
        ]

        this.Out = [
            new NodeOutput('Output', this, 'float')
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return Math.cos(this.ParentNode.GetInputValue('A'));
        }
    }
}

class TimeNode extends Node
{
    constructor()
    {
        super('Time');
        this.Out = [
            new NodeOutput('Output', this, 'float')
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return Date.now() / 1000;
        }
    }
}

class SetVariableNode extends ActionNode
{
    constructor()
    {
        super('Set Variable');
        this.StaticValues = [
            new StaticValue('Variable', 'Variable', this, 'string')
        ]
        this.StaticValues[0].Settings.HideValueName = true;
        this.In.push(
            new NodeInput('Value', this, 'any')
        )
    }

    Action()
    {
        this.Wrapper.Variables[this.StaticValues[0].Value] = this.GetInputValue('Value');
    }
}

class GetVariableNode extends Node
{
    constructor()
    {
        super('Get Variable');
        this.StaticValues = [
            new StaticValue('Variable', 'Variable', this, 'string')
        ]
        this.StaticValues[0].Settings.HideValueName = true;

        this.Out = [
            new NodeOutput('Output', this, 'any')
        ]
    }

    Update()
    {
        this.Out[0].GetValue = function()
        {
            return this.ParentNode.Wrapper.Variables[this.ParentNode.StaticValues[0].Value];
        }
    }
}

class ActionConditionNode extends Node
{
    constructor(name)
    {
        super(name);
        this.Out = [
            new NodeOutput('->', this, 'action')
        ]
    }

    DoesRun() { return false; }

    Action() { 
        for(let i = 0; i < this.Out[0].LinkedProperties.length; i++)
        {
            this.Out[0].LinkedProperties[i].ParentNode.Action();
        }
    }

    Update() {
        if(this.DoesRun()) this.Action();
    }
}

class AlwaysNode extends ActionConditionNode
{
    constructor()
    {
        super('Always');
    }

    DoesRun() { return true; }
}

class CommentNode extends Node
{
    constructor()
    {
        super('Comment (//)');
        this.Settings.Opacity = 0.2;
        this.StaticValues = [
            new StaticValue('Text', 'Type your comment', this, 'string')
        ]
        this.StaticValues[0].Settings.HideValueName = true;
        // slight green
        this.StaticValues[0].Settings.TextColorOverride = '#ABFFAB';
    }
}

const LOGIC_NODE_SET = [
    GreaterThanNode,
    LessThanNode,
    EqualsNode,
    NotNode,
    AndNode,
    OrNode,
    ConditionNode,
    SwitchNode,
    AlwaysNode,
    StringNode,
    TrueNode,
    FalseNode,
    TimeNode,
    SetVariableNode,
    GetVariableNode,
    CommentNode
]

const MATH_NODE_SET = [
    NumberNode,
    AddNode,
    SubtractNode,
    MultiplyNode,
    DivideNode,
    SinNode,
    CosNode
]

const IO_NODE_SET = [
    DisplayNode,
    ConsoleLogNode
]

const TEXTURE_NODE_SET = [
    MaterialOutputNode,
    MaterialNode,
    ColorNode,
    ColorAddNode,
    ColorSubtractNode,
    ColorMultiplyNode,
    ColorDivideNode,
    ColorMixNode,
    TextureNode,
    NoiseNode,
    Sampler2DNode
]

const STANDARD_NODE_SET = [
    ...MATH_NODE_SET,
    ...LOGIC_NODE_SET,
    ...IO_NODE_SET,
]

class NodeRegistry {
    static Nodes = []
    static ClassReflection = false;

    static Register(nodeClass) {
        this.Nodes.push(nodeClass);
    }

    static RegisterSet(set) {
        for (let i = 0; i < set.length; i++) {
            this.Register(set[i]);
        }
    }

    static GetAll() {
        return this.Nodes;
    }
}