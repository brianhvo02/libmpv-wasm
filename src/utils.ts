export const formatTime = (s: number) => {
    const seconds = Math.floor(s);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return (hours > 0 ? `${hours}:` : '') + `${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export const isVideoTrack = (track: Track): track is VideoTrack =>
    track.type === 'video';

export const isAudioTrack = (track: Track): track is AudioTrack =>
    track.type === 'audio';