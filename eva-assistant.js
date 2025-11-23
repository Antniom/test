import * as THREE from 'https://cdn.skypack.dev/three@0.129.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/GLTFLoader.js';

class EvaAssistant {
    constructor() {
        this.container = document.getElementById('eva-canvas');
        this.bubble = document.getElementById('eva-bubble');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.model = null;
        this.evaGroup = null; // Group for macro movement
        this.mixer = null;
        this.actions = {};
        this.clock = new THREE.Clock();
        this.mouse = new THREE.Vector2();
        this.targetPosition = new THREE.Vector3(2, -1, 0); // Initial position (right side)
        this.data = null;
        this.currentLang = 'en';
        this.currentSection = 'hero';
        this.lastScrollY = 0;
        this.lastScrollTime = Date.now();

        // Hover Rings
        this.rings = [];
        this.ringCount = 6;

        this.init();
    }

    async init() {
        try {
            // Load Data
            const response = await fetch('eva-data.json');
            this.data = await response.json();

            // Setup Three.js
            this.scene = new THREE.Scene();
            this.evaGroup = new THREE.Group();
            this.scene.add(this.evaGroup);

            // Camera
            this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
            this.camera.position.z = 5;

            // Renderer
            this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.container.appendChild(this.renderer.domElement);

            // Lights - Soft White Tones
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Soft base
            this.scene.add(ambientLight);

            const mainLight = new THREE.DirectionalLight(0xffffff, 1.2); // Key light
            mainLight.position.set(5, 10, 7);
            this.scene.add(mainLight);

            const fillLight = new THREE.DirectionalLight(0xffffff, 0.8); // Fill light
            fillLight.position.set(-5, 2, -5);
            this.scene.add(fillLight);

            // Hover Rings (Emitted Meshes)
            // Create a ring texture
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const context = canvas.getContext('2d');

            context.beginPath();
            context.arc(64, 64, 48, 0, 2 * Math.PI);
            context.lineWidth = 8;
            context.strokeStyle = 'rgba(0, 255, 255, 0.8)'; // Cyan
            context.shadowBlur = 20;
            context.shadowColor = 'rgba(0, 255, 255, 1)'; // Cyan glow
            context.stroke();

            const texture = new THREE.CanvasTexture(canvas);
            const ringGeometry = new THREE.PlaneGeometry(0.8, 0.8);
            const ringMaterial = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            for (let i = 0; i < this.ringCount; i++) {
                const ring = new THREE.Mesh(ringGeometry, ringMaterial.clone());
                ring.rotation.x = -Math.PI / 2;
                ring.position.y = -1000; // Hide initially

                // Custom properties for animation
                ring.userData = {
                    life: i / this.ringCount, // Stagger start
                };

                this.rings.push(ring);
                this.evaGroup.add(ring);
            }

            // Load Model
            const loader = new GLTFLoader();
            loader.load('eva_low_poly.glb', (gltf) => {
                this.model = gltf.scene;
                this.model.scale.set(0.4, 0.4, 0.4); // Reduced scale

                // Add model to group instead of scene directly
                this.evaGroup.add(this.model);
                this.evaGroup.position.copy(this.targetPosition);

                // Animations
                this.mixer = new THREE.AnimationMixer(this.model);
                gltf.animations.forEach((clip) => {
                    this.actions[clip.name] = this.mixer.clipAction(clip);
                });

                // Play Idle
                const idleAnim = gltf.animations.find(a => a.name.toLowerCase().includes('idle'));
                if (idleAnim) {
                    this.actions[idleAnim.name].play();
                }

                this.setupInteractions();
                this.animate();

                // Initial greeting
                if (this.data && this.data.sections && this.data.sections.hero) {
                    this.say(this.data.sections.hero);
                }
            }, undefined, (error) => {
                console.error('An error occurred loading the model:', error);
                if (this.bubble) {
                    this.bubble.textContent = "Error loading 3D model.";
                    this.bubble.classList.add('visible');
                }
            });

            // Event Listeners
            window.addEventListener('resize', () => this.onWindowResize());
            window.addEventListener('scroll', () => this.onScroll());
            this.setupLanguagePicker();
            this.setupScrollAnimations();

        } catch (e) {
            console.error("Initialization error:", e);
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onScroll() {
        const scrollY = window.scrollY;
        const height = document.documentElement.scrollHeight - window.innerHeight;
        const progress = scrollY / height;

        // Trigger section intros
        const sections = ['hero', 'workflow', 'features', 'pricing', 'download'];
        let sectionIndex = 0;
        if (progress < 0.2) sectionIndex = 0;
        else if (progress < 0.4) sectionIndex = 1;
        else if (progress < 0.6) sectionIndex = 2;
        else if (progress < 0.8) sectionIndex = 3;
        else sectionIndex = 4;

        const sectionName = sections[sectionIndex];

        if (this.currentSection !== sectionName) {
            this.currentSection = sectionName;
            if (this.data && this.data.sections && this.data.sections[sectionName]) {
                this.say(this.data.sections[sectionName]);
            }
        }
    }

    setupInteractions() {
        window.addEventListener('click', (event) => {
            const raycaster = new THREE.Raycaster();
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(this.mouse, this.camera);

            if (this.model) {
                const intersects = raycaster.intersectObject(this.model, true);
                if (intersects.length > 0) {
                    this.showRandomFact();
                    this.playRandomAnimation();
                }
            }
        });
    }

    playRandomAnimation() {
        const animNames = Object.keys(this.actions);
        if (animNames.length > 1) {
            const randomAnim = animNames[Math.floor(Math.random() * animNames.length)];
            const action = this.actions[randomAnim];
            action.reset();
            action.setLoop(THREE.LoopOnce);
            action.play();
            action.clampWhenFinished = true;

            setTimeout(() => {
                const idleAnim = Object.keys(this.actions).find(name => name.toLowerCase().includes('idle'));
                if (idleAnim) {
                    action.crossFadeTo(this.actions[idleAnim], 1, true);
                    this.actions[idleAnim].play();
                }
            }, action.getClip().duration * 1000);
        }
    }

    showRandomFact() {
        if (!this.data || !this.data.facts) return;
        const facts = this.data.facts;
        const randomFact = facts[Math.floor(Math.random() * facts.length)];
        this.say(randomFact);
    }

    say(text) {
        if (!this.bubble) return;
        this.bubble.textContent = text;
        this.bubble.classList.add('visible');

        if (this.model) {
            const vector = new THREE.Vector3();
            this.model.getWorldPosition(vector);
            vector.y += 0.5; // Offset
            vector.project(this.camera);

            const x = (vector.x * .5 + .5) * window.innerWidth;
            const y = (-(vector.y * .5) + .5) * window.innerHeight;

            this.bubble.style.left = `${x}px`;
            this.bubble.style.top = `${y}px`;
        }

        setTimeout(() => {
            this.bubble.classList.remove('visible');
        }, 4000);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();
        if (this.mixer) this.mixer.update(delta);

        const time = this.clock.elapsedTime;

        // Organic Wandering Movement
        if (this.evaGroup) {
            // X: Wide sweep left/right
            this.evaGroup.position.x = Math.sin(time * 0.2) * 3 + Math.cos(time * 0.5) * 1;

            // Y: Gentle bobbing
            this.evaGroup.position.y = -1 + Math.sin(time * 0.8) * 0.2;

            // Z: Deep forward/backward movement (Walking all over)
            this.evaGroup.position.z = Math.cos(time * 0.25) * 2; // Range -2 to 2

            // Rotation: Face direction of movement (approximate derivative of X)
            // dx/dt ~ cos(0.2t) - sin(0.5t)
            const dx = Math.cos(time * 0.2) * 0.6 - Math.sin(time * 0.5) * 0.5;
            this.evaGroup.rotation.y = dx * 0.5; // Lean into turn
        }

        // Ring Emission Animation
        if (this.rings) {
            this.rings.forEach(ring => {
                ring.userData.life -= 0.01; // Decay rate

                if (ring.userData.life < 0) {
                    ring.userData.life = 1; // Reset
                }

                const life = ring.userData.life;

                // Position: Start at -0.2 (closer to feet), move down to -1.2
                ring.position.y = -0.2 - (1 - life) * 1.0;

                // Scale: Start at 1, shrink to 0
                const scale = life * 0.8;
                ring.scale.set(scale, scale, scale);

                // Opacity: Fade out near end
                ring.material.opacity = life;
            });
        }

        // Micro movement (Model local)
        if (this.model) {
            this.model.position.y = Math.sin(time * 2) * 0.05; // Extra little float

            if (this.bubble.classList.contains('visible')) {
                const vector = new THREE.Vector3();
                this.model.getWorldPosition(vector);
                vector.y += 0.5;
                vector.project(this.camera);
                const x = (vector.x * .5 + .5) * window.innerWidth;
                const y = (-(vector.y * .5) + .5) * window.innerHeight;
                this.bubble.style.left = `${x}px`;
                this.bubble.style.top = `${y}px`;
            }
        }
        this.renderer.render(this.scene, this.camera);
    }

    setupLanguagePicker() {
        const picker = document.getElementById('language-picker');
        if (!picker) return;
        picker.addEventListener('change', (e) => {
            this.setLanguage(e.target.value);
        });
    }

    setLanguage(lang) {
        this.currentLang = lang;
        if (!this.data || !this.data.translations) return;
        const t = this.data.translations[lang];
        if (!t) return;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (t[key]) el.textContent = t[key];
        });
    }

    setupScrollAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.feature-card, .hero-content, h2').forEach(el => {
            el.classList.add('animate-hidden');
            observer.observe(el);
        });
    }
}

new EvaAssistant();
