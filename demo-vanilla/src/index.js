import MpvPlayer from 'libmpv-wasm';
import './style.css';

const container = document.createElement('div');
container.classList.add('container');
const canvas = document.createElement('canvas');
canvas.id = 'canvas';
const canvasBlocker = document.createElement('div');
canvasBlocker.classList.add('canvas-blocker');
container.appendChild(canvas);
container.appendChild(canvasBlocker);
document.body.appendChild(container);

const path = "/libmpv.js";
const mpvPlayer = await MpvPlayer.load(canvas, path, {
    idle: () => {
        const uploadButton = document.createElement('button');
        uploadButton.textContent = 'Upload';
        uploadButton.onclick = () => mpvPlayer.uploadFiles();
        document.body.appendChild(uploadButton);

        const playButton = document.createElement('button');
        playButton.id = 'play-button';
        playButton.textContent = 'Pause';
        playButton.onclick = () => mpvPlayer.module.togglePlay();
        document.body.appendChild(playButton);
    },
    isPlaying: isPlaying => {
        document.getElementById('play-button').textContent = isPlaying
            ? 'Pause' : 'Play';
    },
    files: files => {
        files.forEach(file => {
            const fileButton = document.createElement('button');
            fileButton.textContent = file;
            fileButton.onclick = mpvPlayer.loadFile.bind(mpvPlayer, file);
            document.body.appendChild(fileButton);
        });
    },
    shaderCount: count => {
        if (count === 0) return;

        const shaderOnButton = document.createElement('button');
        shaderOnButton.textContent = 'Turn Anime4K shaders on';
        shaderOnButton.onclick = () => mpvPlayer.module.addShaders();
        document.body.appendChild(shaderOnButton);

        const shaderOffButton = document.createElement('button');
        shaderOffButton.textContent = 'Turn Anime4K shaders off';
        shaderOffButton.onclick = () => mpvPlayer.module.clearShaders();
        document.body.appendChild(shaderOffButton);
    }
});