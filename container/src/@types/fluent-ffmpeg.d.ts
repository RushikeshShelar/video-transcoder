declare module 'fluent-ffmpeg' {
    import { ChildProcess } from 'child_process';

    interface FfmpegCommand {
        output(output: string): FfmpegCommand;
        withVideoCodec(codec: string): FfmpegCommand;
        withAudioCodec(codec: string): FfmpegCommand;
        withSize(size: string): FfmpegCommand;
        on(event: 'end', callback: () => void): FfmpegCommand;
        on(event: 'error', callback: (error: Error) => void): FfmpegCommand;
        format(format: string): FfmpegCommand;
        run(): ChildProcess;
    }

    function ffmpeg(input: string): FfmpegCommand;

    export default ffmpeg;
}
