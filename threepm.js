(function(Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('This extension must run unsandboxed');
    }

    const vm = Scratch.vm;
    const runtime = vm.runtime;
    const objects = {};
    let scene, camera, renderer;
    
    // Physics Globals
    let world;
    let physicsEnabled = false;
    const physicsBodies = {}; 
    const physicsMeshMap = {}; 

    // Flare Globals
    const lightFlares = [];

    // Camera Attachment Globals (Fixes rendering issue when attached to camera)
    const cameraAttachments = [];

    const loadScript = (url) => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load ${url}`));
            document.head.appendChild(script);
        });
    };

    const parseArg = (arg) => {
        const str = String(arg);
        if (str.startsWith('@')) return objects[str.substring(1)];
        if (str.startsWith('#')) return parseInt(str.replace('#', '0x'), 16);
        try { return JSON.parse(str); } catch (e) { return str; }
    };

    class ThreePM {
        getInfo() {
            return {
                id: 'threepm',
                name: 'Three.pm',
                color1: '#6b47fd',
                color2: '#6b47fd',
                menuIconURI: 'https://github.com/ff6f8d68/three.pm/blob/main/three-js-removebg-preview.png?raw=true',
                blockIconURI: 'https://github.com/ff6f8d68/three.pm/blob/main/three-js-removebg-preview.png?raw=true',
                blocks: [
                    // --- SETUP ---
                    {
                        blockType: Scratch.BlockType.LABEL,
                        text: 'Setup',
                    },
                    {
                        opcode: 'loadThree',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Load Three.js Engine',
                    },
                    {
                        opcode: 'initScene',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Initialize Scene | Transparent: [TRANS] | Background: [COLOR]',
                        arguments: {
                            TRANS: { type: Scratch.ArgumentType.BOOLEAN, defaultValue: false },
                            COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#000000' }
                        }
                    },
                    {
                        opcode: 'clearScene',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Clear All Objects from Scene',
                    },
                    {
                        opcode: 'setSkybox',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Set Skybox (Panorama) URL: [URL]',
                        arguments: { URL: { type: Scratch.ArgumentType.STRING, defaultValue: '' } }
                    },
                    // --- OBJECTS ---
                    {
                        blockType: Scratch.BlockType.LABEL,
                        text: 'Objects',
                    },
                    {
                        opcode: 'quickShape',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'New [ID] shape [SHAPE] color [COLOR]',
                        arguments: {
                            ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'cube1' },
                            SHAPE: { type: Scratch.ArgumentType.STRING, menu: 'shapes', defaultValue: 'BoxGeometry' },
                            COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#ffffff' }
                        }
                    },
                    {
                        opcode: 'loadOBJMTL',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Load OBJ [ID] from URL [OBJ] with MTL [MTL]',
                        arguments: {
                            ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'model1' },
                            OBJ: { type: Scratch.ArgumentType.STRING, defaultValue: '' },
                            MTL: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
                        }
                    },
                    // --- LIGHTING & MATERIALS ---
                    {
                        blockType: Scratch.BlockType.LABEL,
                        text: 'Lighting & Materials',
                    },
                    {
                        opcode: 'createLight',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Create Light [ID] type [TYPE] color [COLOR] intensity [INT] flare: [FLARE]',
                        arguments: {
                            ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'light1' },
                            TYPE: { type: Scratch.ArgumentType.STRING, menu: 'lightTypes', defaultValue: 'PointLight' },
                            COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#ffffff' },
                            INT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
                            FLARE: { type: Scratch.ArgumentType.BOOLEAN, defaultValue: true }
                        }
                    },
                    {
                        opcode: 'setTextureGlobal',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Set [ID] texture [TYPE] to [URL]',
                        arguments: {
                            ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'cube1' },
                            TYPE: { type: Scratch.ArgumentType.STRING, menu: 'texTypes', defaultValue: 'Skin' },
                            URL: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
                        }
                    },
                    {
                        opcode: 'setTextureSide',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Set [ID] side [SIDE] texture [TYPE] to [URL]',
                        arguments: {
                            ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'cube1' },
                            SIDE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            TYPE: { type: Scratch.ArgumentType.STRING, menu: 'texTypes', defaultValue: 'Skin' },
                            URL: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
                        }
                    },
                    // --- SCENE MANAGEMENT ---
                    {
                        blockType: Scratch.BlockType.LABEL,
                        text: 'Scene Management',
                    },
                    {
                        opcode: 'lookAt',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '[ID] Look At [TARGET]',
                        arguments: {
                            ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'camera' },
                            TARGET: { type: Scratch.ArgumentType.STRING, defaultValue: 'light1' }
                        }
                    },
                    {
                        opcode: 'addToScene',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Add [ID] to Scene',
                        arguments: { ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'cube1' } }
                    },
                    {
                        opcode: 'removeFromScene',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Remove [ID] from Scene',
                        arguments: { ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'cube1' } }
                    },
                    // --- ATTACHMENT ---
                    {
                        blockType: Scratch.BlockType.LABEL,
                        text: 'Attachment',
                    },
                    {
                        opcode: 'attachObject',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Attach [CHILD] in front of [PARENT] dist [DIST]',
                        arguments: {
                            CHILD: { type: Scratch.ArgumentType.STRING, defaultValue: 'cube2' },
                            PARENT: { type: Scratch.ArgumentType.STRING, defaultValue: 'cube1' },
                            DIST: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }
                        }
                    },
                    {
                        opcode: 'detachObject',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Detach [ID] to Scene',
                        arguments: {
                            ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'cube2' }
                        }
                    },
                    // --- CAMERA CONTROLS ---
                    {
                        blockType: Scratch.BlockType.LABEL,
                        text: 'Camera',
                    },
                    {
                        opcode: 'cameraYaw',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Camera Yaw (Turn) by [DEG]',
                        arguments: { DEG: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 } }
                    },
                    {
                        opcode: 'cameraPitch',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Camera Pitch (Look Up/Down) by [DEG]',
                        arguments: { DEG: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 } }
                    },
                    {
                        opcode: 'cameraRoll',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Camera Roll (Tilt) by [DEG]',
                        arguments: { DEG: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 } }
                    },
                    {
                        opcode: 'cameraMoveForward',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Camera Move Forward/Back by [DIST]',
                        arguments: { DIST: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } }
                    },
                    {
                        opcode: 'cameraMoveRight',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Camera Move Right/Left by [DIST]',
                        arguments: { DIST: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } }
                    },
                    {
                        opcode: 'cameraMoveUp',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Camera Move Up/Down by [DIST]',
                        arguments: { DIST: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } }
                    },
                    // --- PHYSICS ---
                    {
                        blockType: Scratch.BlockType.LABEL,
                        text: 'Physics',
                    },
                    {
                        opcode: 'enablePhysics',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Enable Physics [ENABLE]',
                        arguments: { ENABLE: { type: Scratch.ArgumentType.BOOLEAN, defaultValue: true } }
                    },
                    {
                        opcode: 'setGravity',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Set Gravity X [X] Y [Y] Z [Z]',
                        arguments: {
                            X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: -9.82 },
                            Z: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
                        }
                    },
                    {
                        opcode: 'changeGravity',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Change Gravity X [X] Y [Y] Z [Z]',
                        arguments: {
                            X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            Z: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
                        }
                    },
                    {
                        opcode: 'getGravity',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'Gravity',
                    },
                    {
                        opcode: 'addBody',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Add Physics Body [ID] Static: [STATIC] Mass: [MASS] Bind to: [MESH_ID]',
                        arguments: {
                            ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'phys1' },
                            STATIC: { type: Scratch.ArgumentType.BOOLEAN, defaultValue: false },
                            MASS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
                            MESH_ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'cube1' }
                        }
                    },
                    {
                        opcode: 'setVelocity',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Set [ID] Velocity X [X] Y [Y] Z [Z]',
                        arguments: {
                            ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'phys1' },
                            X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            Z: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
                        }
                    },
                    // --- PROPERTIES ---
                    {
                        blockType: Scratch.BlockType.LABEL,
                        text: 'Properties',
                    },
                    {
                        opcode: 'setProperty',
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Set [ID]'s [PROP] to [VAL]",
                        arguments: {
                            ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'cube1' },
                            PROP: { type: Scratch.ArgumentType.STRING, menu: 'properties', defaultValue: 'position.x' },
                            VAL: { type: Scratch.ArgumentType.STRING, defaultValue: '0' }
                        }
                    },
                    {
                        opcode: 'changeProperty',
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Change [ID]'s [PROP] by [VAL]",
                        arguments: {
                            ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'cube1' },
                            PROP: { type: Scratch.ArgumentType.STRING, menu: 'properties', defaultValue: 'position.x' },
                            VAL: { type: Scratch.ArgumentType.NUMBER, defaultValue: '0.1' }
                        }
                    },
                    {
                        opcode: 'getProperty',
                        blockType: Scratch.BlockType.REPORTER,
                        text: "[ID]'s [PROP]",
                        arguments: {
                            ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'cube1' },
                            PROP: { type: Scratch.ArgumentType.STRING, menu: 'properties', defaultValue: 'position.x' }
                        }
                    },
                    {
                        opcode: 'render',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Update Screen (Render)',
                    }
                ],
                menus: {
                    shapes: ['BoxGeometry', 'SphereGeometry', 'PlaneGeometry', 'TorusGeometry', 'CylinderGeometry'],
                    lightTypes: ['PointLight', 'SpotLight', 'DirectionalLight', 'HemisphereLight'],
                    texTypes: ['Skin', 'Bumps', 'Roughness', 'Reflection'],
                    properties: [
                        'position.x', 'position.y', 'position.z', 
                        'rotation.x', 'rotation.y', 'rotation.z', 
                        'scale.x', 'scale.y', 'scale.z', 
                        'visible', 'material.opacity', 
                        'intensity', 'distance', 'angle', 'penumbra', 'decay',
                        'color', 'groundColor'
                    ]
                }
            };
        }

        async loadThree() {
            if (window.THREE) return;
            try {
                await loadScript('https://cdn.jsdelivr.net/npm/three@0.125.0/build/three.min.js');
                await loadScript('https://cdn.jsdelivr.net/npm/three@0.125.0/examples/js/loaders/MTLLoader.js');
                await loadScript('https://cdn.jsdelivr.net/npm/three@0.125.0/examples/js/loaders/OBJLoader.js');
                await loadScript('https://cdn.jsdelivr.net/npm/three@0.125.0/examples/js/objects/Lensflare.js');
                // Load Cannon.js for physics
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js');
            } catch (e) {
                console.error(e);
            }
        }

        initScene({ TRANS, COLOR }) {
            if (!window.THREE) return;
            const old = document.getElementById('three-layer');
            if (old) old.remove();

            const canvas = document.createElement('canvas');
            canvas.id = 'three-layer';
            Object.assign(canvas.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '1' });
            runtime.renderer.canvas.parentElement.appendChild(canvas);

            scene = new THREE.Scene();
            const width = runtime.renderer.canvas.clientWidth;
            const height = runtime.renderer.canvas.clientHeight;
            camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 2000);
            camera.position.z = 5;

            renderer = new THREE.WebGLRenderer({ canvas, alpha: TRANS, antialias: true });
            renderer.setSize(width, height, false);
            if (!TRANS) renderer.setClearColor(COLOR, 1);

            const ro = new ResizeObserver(() => {
                const w = runtime.renderer.canvas.clientWidth;
                const h = runtime.renderer.canvas.clientHeight;
                renderer.setSize(w, h, false);
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
            });
            ro.observe(runtime.renderer.canvas);

            objects['scene'] = scene;
            objects['camera'] = camera;
        }

        // --- PARENTING / ATTACHMENT ---

        attachObject({ CHILD, PARENT, DIST }) {
            const child = objects[CHILD];
            const parent = objects[PARENT];
            if (!child || !parent) return;

            // 1. Remove physics body if it exists (Parenting overrides independent physics)
            if (physicsBodies[CHILD]) {
                world.removeBody(physicsBodies[CHILD]);
                delete physicsBodies[CHILD];
                delete physicsMeshMap[CHILD];
            }

            // 2. Check if attaching to Camera (Special Case for Rendering)
            if (parent === camera) {
                // Remove from standard scene graph parenting
                if (child.parent) child.parent.remove(child);
                // Add to scene so it renders, but we will manually control its position
                scene.add(child);
                
                // Store in special camera attachments list
                cameraAttachments.push({ 
                    child: child, 
                    dist: -Number(DIST) // Negative Z is forward
                });
                
                // Set initial local rotation to face forward
                child.rotation.set(0, 0, 0);
            } else {
                // Standard Object Parenting
                parent.add(child);
                child.position.set(0, 0, -Number(DIST));
                child.rotation.set(0, 0, 0);
                child.updateMatrix();
            }
        }

        detachObject({ ID }) {
            const obj = objects[ID];
            if (!obj) return;

            // Check if it's a camera attachment
            const attIndex = cameraAttachments.findIndex(e => e.child === obj);
            
            if (attIndex !== -1) {
                // Detaching from camera
                cameraAttachments.splice(attIndex, 1);
                // Object stays in scene (added in attachObject), so no need to re-add
            } else {
                // Detaching from standard parent
                if (obj.parent && obj.parent !== scene) {
                    const position = new THREE.Vector3();
                    const quaternion = new THREE.Quaternion();
                    const scale = new THREE.Vector3();
                    
                    obj.getWorldPosition(position);
                    obj.getWorldQuaternion(quaternion);
                    obj.getWorldScale(scale);

                    scene.add(obj);

                    obj.position.copy(position);
                    obj.quaternion.copy(quaternion);
                    obj.scale.copy(scale);
                    obj.updateMatrix();
                }
            }
        }

        // --- PHYSICS ENGINE LOGIC ---

        enablePhysics({ ENABLE }) {
            if (!window.CANNON) return;
            physicsEnabled = ENABLE;
            
            if (physicsEnabled) {
                if (!world) {
                    world = new CANNON.World();
                    world.gravity.set(0, -9.82, 0);
                    world.broadphase = new CANNON.NaiveBroadphase();
                    world.solver.iterations = 10;
                }
            }
        }

        setGravity({ X, Y, Z }) {
            if (world && physicsEnabled) {
                world.gravity.set(Number(X), Number(Y), Number(Z));
            }
        }

        changeGravity({ X, Y, Z }) {
            if (world && physicsEnabled) {
                world.gravity.x += Number(X);
                world.gravity.y += Number(Y);
                world.gravity.z += Number(Z);
            }
        }

        getGravity() {
            if (world && physicsEnabled) {
                const g = world.gravity;
                return `${g.x},${g.y},${g.z}`;
            }
            return "0,0,0";
        }

        addBody({ ID, STATIC, MASS, MESH_ID }) {
            if (!world || !physicsEnabled) return;
            
            let mass = Number(MASS);
            if (STATIC) {
                mass = 0; 
            }

            const mesh = objects[MESH_ID];
            if (!mesh) {
                console.warn(`Three.pm: Cannot bind physics body [${ID}] to missing mesh [${MESH_ID}]`);
                return;
            }

            mesh.updateMatrixWorld();
            
            const box = new THREE.Box3().setFromObject(mesh);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);

            // AUTO GENERATE: Always use Box for collision stability and accuracy based on mesh size
            const halfExtents = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
            const shape = new CANNON.Box(halfExtents);

            const body = new CANNON.Body({ mass: mass });
            body.addShape(shape);

            body.position.set(center.x, center.y, center.z);
            
            if (mass > 0) {
                body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
            }

            world.addBody(body);
            physicsBodies[ID] = body;
            physicsMeshMap[ID] = mesh;
        }

        setVelocity({ ID, X, Y, Z }) {
            if (!physicsEnabled) return;
            const body = physicsBodies[ID];
            if (body) {
                body.velocity.set(Number(X), Number(Y), Number(Z));
            }
        }

        // --- END PHYSICS ---

        clearScene() {
            if (!scene) return;
            if (world) {
                for (const id in physicsBodies) {
                    world.removeBody(physicsBodies[id]);
                }
                for (const prop in physicsBodies) delete physicsBodies[prop];
                for (const prop in physicsMeshMap) delete physicsMeshMap[prop];
            }

            // Clear flares
            lightFlares.length = 0;
            // Clear camera attachments
            cameraAttachments.length = 0;

            while(scene.children.length > 0){ 
                scene.remove(scene.children[0]); 
            }
        }

        setSkybox({ URL }) {
            if (!scene) return;
            const loader = new THREE.TextureLoader();
            loader.setCrossOrigin('anonymous'); 
            loader.load(URL, (texture) => {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                scene.background = texture;
                scene.environment = texture;
                if (renderer && scene && camera) {
                    scene.updateMatrixWorld();
                    renderer.render(scene, camera);
                }
            });
        }

        quickShape({ ID, SHAPE, COLOR }) {
            if (!window.THREE) return;
            
            let geo;
            switch (SHAPE) {
                case 'BoxGeometry': geo = new THREE.BoxGeometry(1, 1, 1); break;
                case 'SphereGeometry': geo = new THREE.SphereGeometry(1, 32, 16); break;
                case 'PlaneGeometry': geo = new THREE.PlaneGeometry(1, 1); break;
                case 'TorusGeometry': geo = new THREE.TorusGeometry(1, 0.4, 16, 100); break;
                case 'CylinderGeometry': geo = new THREE.CylinderGeometry(1, 1, 1, 32); break;
                default: geo = new THREE.BoxGeometry(1, 1, 1);
            }

            const materials = Array.from({length: SHAPE === 'BoxGeometry' ? 6 : 1}, () => 
                new THREE.MeshStandardMaterial({ color: parseArg(COLOR) })
            );
            objects[ID] = new THREE.Mesh(geo, materials.length > 1 ? materials : materials[0]);
        }

        createLight({ ID, TYPE, COLOR, INT, FLARE }) {
            if (!window.THREE) return;
            const light = new THREE[TYPE](parseArg(COLOR), Number(INT));
            
            if (FLARE && TYPE === 'PointLight') {
                const textureLoader = new THREE.TextureLoader();
                const textureFlare0 = textureLoader.load('https://threejs.org/examples/textures/lensflare/lensflare0.png');
                const textureFlare3 = textureLoader.load('https://threejs.org/examples/textures/lensflare/lensflare3.png');

                const lensflare = new THREE.Lensflare();
                lensflare.frustumCulled = false; 
                lensflare.renderOrder = 999;     
                
                lensflare.addElement(new THREE.LensflareElement(textureFlare0, 700, 0, light.color));
                lensflare.addElement(new THREE.LensflareElement(textureFlare3, 60, 0.6));
                lensflare.addElement(new THREE.LensflareElement(textureFlare3, 70, 0.7));
                lensflare.addElement(new THREE.LensflareElement(textureFlare3, 120, 0.9));
                lensflare.addElement(new THREE.LensflareElement(textureFlare3, 70, 1));

                scene.add(lensflare);
                
                lightFlares.push({ light: light, flare: lensflare });
            }

            objects[ID] = light;
        }

        loadOBJMTL({ ID, OBJ, MTL }) {
            if (!window.THREE || !THREE.OBJLoader || !THREE.MTLLoader) return;
            const mtlLoader = new THREE.MTLLoader();
            mtlLoader.setCrossOrigin('anonymous');
            
            const loadModel = (materials = null) => {
                const objLoader = new THREE.OBJLoader();
                if (materials) objLoader.setMaterials(materials);
                objLoader.load(OBJ, (obj) => { 
                    objects[ID] = obj;
                    if (scene) {
                        scene.add(obj);
                    }
                });
            };
            if (MTL) mtlLoader.load(MTL, (mat) => { mat.preload(); loadModel(mat); });
            else loadModel();
        }

        lookAt({ ID, TARGET }) {
            const obj = objects[ID];
            const target = objects[TARGET];
            if (obj && target) obj.lookAt(target.position);
        }

        _applyTexture(mat, type, url) {
            if (!mat) return;
            const loader = new THREE.TextureLoader();
            loader.setCrossOrigin('anonymous');
            const tex = url ? loader.load(url) : null;
            switch (type) {
                case 'Skin': mat.map = tex; if (url) mat.color.set(0xffffff); break;
                case 'Bumps': mat.normalMap = tex; break;
                case 'Roughness': mat.roughnessMap = tex; break;
                case 'Reflection': if (tex) tex.mapping = THREE.EquirectangularReflectionMapping; mat.envMap = tex; break;
            }
            mat.needsUpdate = true;
        }

        setTextureGlobal({ ID, TYPE, URL }) {
            const obj = objects[ID];
            if (!obj) return;
            obj.traverse(node => {
                if (node.isMesh) {
                    const mats = Array.isArray(node.material) ? node.material : [node.material];
                    mats.forEach(m => this._applyTexture(m, TYPE, URL));
                }
            });
        }

        setTextureSide({ ID, SIDE, TYPE, URL }) {
            const obj = objects[ID];
            if (!obj) return;
            const mesh = obj.isMesh ? obj : obj.children.find(c => c.isMesh);
            if (mesh) {
                const targetMat = Array.isArray(mesh.material) ? mesh.material[SIDE] : mesh.material;
                this._applyTexture(targetMat, TYPE, URL);
            }
        }

        _getPropContext(id, prop) {
            if (!objects[id]) return null;
            const parts = String(prop).split('.');
            let target = objects[id];
            for (let i = 0; i < parts.length - 1; i++) {
                if (!target || target[parts[i]] === undefined) return null;
                target = target[parts[i]];
            }
            return { target, key: parts[parts.length - 1] };
        }

        setProperty({ ID, PROP, VAL }) {
            const ctx = this._getPropContext(ID, PROP);
            if (ctx && ctx.target) {
                let finalVal = parseArg(VAL);
                if (PROP.includes('rotation')) finalVal = finalVal * (Math.PI / 180);
                
                if (ctx.target[ctx.key] && typeof ctx.target[ctx.key] === 'object' && ctx.target[ctx.key].isColor) {
                     ctx.target[ctx.key].set(finalVal);
                } else {
                     ctx.target[ctx.key] = finalVal;
                }
            }
        }

        changeProperty({ ID, PROP, VAL }) {
            const ctx = this._getPropContext(ID, PROP);
            if (ctx && ctx.target && typeof ctx.target[ctx.key] === 'number') {
                let change = Number(VAL);
                if (PROP.includes('rotation')) change = change * (Math.PI / 180);
                ctx.target[ctx.key] += change;
            }
        }

        getProperty({ ID, PROP }) {
            const ctx = this._getPropContext(ID, PROP);
            if (ctx && ctx.target) {
                let val = ctx.target[ctx.key];
                if (PROP.includes('rotation')) val = val * (180 / Math.PI);
                if (val && val.isColor) return '#' + val.getHexString();
                return (typeof val === 'object') ? JSON.stringify(val) : val;
            }
            return '';
        }

        addToScene({ ID }) {
            if (scene && objects[ID]) scene.add(objects[ID]);
        }

        removeFromScene({ ID }) {
            if (scene && objects[ID]) {
                scene.remove(objects[ID]);
                // Remove associated flare
                const flareIndex = lightFlares.findIndex(e => e.light === objects[ID]);
                if (flareIndex !== -1) {
                    scene.remove(lightFlares[flareIndex].flare);
                    lightFlares.splice(flareIndex, 1);
                }
            }
        }

        // --- CAMERA CONTROLS ---

        cameraYaw({ DEG }) {
            if (!objects['camera']) return;
            const axis = new THREE.Vector3(0, 1, 0);
            const rad = THREE.Math.degToRad(Number(DEG));
            objects['camera'].rotateOnWorldAxis(axis, rad);
        }

        cameraPitch({ DEG }) {
            if (!objects['camera']) return;
            const rad = THREE.Math.degToRad(Number(DEG));
            objects['camera'].rotateX(rad);
        }

        cameraRoll({ DEG }) {
            if (!objects['camera']) return;
            const rad = THREE.Math.degToRad(Number(DEG));
            objects['camera'].rotateZ(rad);
        }

        // --- RELATIVE CAMERA MOVEMENT ---

        cameraMoveForward({ DIST }) {
            if (!objects['camera']) return;
            objects['camera'].translateZ(Number(DIST));
        }

        cameraMoveRight({ DIST }) {
            if (!objects['camera']) return;
            objects['camera'].translateX(Number(DIST));
        }

        cameraMoveUp({ DIST }) {
            if (!objects['camera']) return;
            objects['camera'].translateY(Number(DIST));
        }

        render() {
            // AUTO-UPDATE PHYSICS LOGIC
            if (physicsEnabled && world) {
                world.step(1 / 60);

                for (const [id, body] of Object.entries(physicsBodies)) {
                    const mesh = physicsMeshMap[id]; 
                    if (mesh) {
                        mesh.position.copy(body.position);
                        mesh.quaternion.copy(body.quaternion);
                    }
                }
            }

            // SYNC FLARES
            for (const entry of lightFlares) {
                if (entry.light && entry.flare) {
                    entry.flare.position.copy(entry.light.position);
                    entry.flare.quaternion.copy(entry.light.quaternion);
                    entry.flare.updateMatrix();
                }
            }

            // SYNC CAMERA ATTACHMENTS (The Fix)
            if (camera && cameraAttachments.length > 0) {
                for (const item of cameraAttachments) {
                    // 1. Match camera rotation
                    item.child.quaternion.copy(camera.quaternion);
                    
                    // 2. Copy camera position
                    item.child.position.copy(camera.position);

                    // 3. Move forward by distance relative to the new rotation
                    item.child.translateZ(item.dist); 
                }
            }

            if (renderer && scene && camera) {
                scene.updateMatrixWorld();
                renderer.render(scene, camera);
            }
        }
    }

    Scratch.extensions.register(new ThreePM());
})(Scratch);
