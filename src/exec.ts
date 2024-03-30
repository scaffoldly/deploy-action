import { info, debug, error, setFailed } from '@actions/core';
import proc from 'child_process';
import { Transform } from 'stream';
import which from 'which';

export class Capture {
  private chunks: any[] = [];

  constructor() {}

  public capture() {
    const chunks = this.chunks;

    return new Transform({
      transform(chunk, _encoding, callback) {
        // Capture the chunk
        chunks.push(chunk);
        // Pass the data through unchanged
        callback(null, chunk);
      },
    });
  }

  public toString() {
    return Buffer.concat(this.chunks).toString('utf-8');
  }
}

export const exec = (argv: string[]): Promise<string> => {
  return new Promise<string>(async (resolve, reject) => {
    const capture = new Capture();

    const env = {
      ...process.env,
    };

    let command: string;
    try {
      command = which.sync(argv[0]);
    } catch (e) {
      reject(
        new Error(
          `Unable to locate the '${argv[0]}' command on this system. Were dependencies installed?`,
        ),
      );
      return;
    }

    info(`Environment: ${JSON.stringify(env)}`);
    info(`Running command: ${command} ${argv.slice(1).join(' ')}`);

    const p = proc.spawn(`"${command}"`, argv.slice(1), {
      shell: true,
      env,
    });

    p.on('error', (err) => {
      error(`Error: ${err}`);
      reject(err);
    });

    p.on('exit', (code) => {
      debug(`${command} exited with code ${code}`);
      if (code && code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
        return;
      }
      resolve(capture.toString());
    });

    p.stdin.pipe(process.stdin);
    p.stdout.pipe(capture.capture().pipe(process.stdout));
    p.stderr.pipe(capture.capture().pipe(process.stderr));
  });
};
