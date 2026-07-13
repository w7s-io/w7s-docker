import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import yauzl from "yauzl";

const safeTarget = (root: string, entryName: string): string | undefined => {
  const normalized = path.normalize(entryName).replace(/^(\.\.(\/|\\|$))+/, "");
  const target = path.resolve(root, normalized);
  const resolvedRoot = path.resolve(root);
  return target.startsWith(`${resolvedRoot}${path.sep}`) || target === resolvedRoot ? target : undefined;
};

export const extractZipBuffer = async (buffer: Buffer, targetDir: string): Promise<void> => {
  await fsp.mkdir(targetDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (openError, zipfile) => {
      if (openError || !zipfile) {
        reject(openError || new Error("Unable to open zip archive."));
        return;
      }

      zipfile.on("error", reject);
      zipfile.on("end", resolve);
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        const target = safeTarget(targetDir, entry.fileName);
        if (!target) {
          zipfile.readEntry();
          return;
        }

        if (/\/$/.test(entry.fileName)) {
          fsp.mkdir(target, { recursive: true }).then(() => zipfile.readEntry(), reject);
          return;
        }

        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            reject(streamError || new Error(`Unable to read ${entry.fileName}.`));
            return;
          }

          fsp.mkdir(path.dirname(target), { recursive: true })
            .then(
              () =>
                new Promise<void>((streamResolve, streamReject) => {
                  const writer = fs.createWriteStream(target, { mode: 0o644 });
                  writer.on("finish", streamResolve);
                  writer.on("error", streamReject);
                  stream.on("error", streamReject);
                  stream.pipe(writer);
                })
            )
            .then(() => zipfile.readEntry(), reject);
        });
      });
    });
  });
};
