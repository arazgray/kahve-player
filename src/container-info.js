import { CustomSource, Input, MATROSKA, WEBM, MP4, QTFF, OGG, MPEG_TS } from 'mediabunny';

export async function inspectContainer(file, signal) {
  const limit = 32 * 1024 * 1024;
  let read = 0;
  const input = new Input({
    formats: [WEBM, MATROSKA, MP4, QTFF, OGG, MPEG_TS],
    source: new CustomSource({
      getSize: () => file.size,
      async read(start, end) {
        signal.throwIfAborted();
        read += end - start;
        if (read > limit) throw new Error('Container probe exceeded its read budget.');
        return new Uint8Array(await file.slice(start, end).arrayBuffer());
      },
    }),
  });
  const readOptional = async (probe) => {
    try { return await probe(); }
    catch { signal.throwIfAborted(); return undefined; }
  };
  try {
    const container = await input.getFormat();
    const video = await readOptional(() => input.getPrimaryVideoTrack());
    const audio = await readOptional(() => input.getPrimaryAudioTrack());
    const videoCodec = await readOptional(() => video?.getCodec());
    const audioCodec = await readOptional(() => audio?.getCodec());
    const width = await readOptional(() => video?.getCodedWidth());
    const height = await readOptional(() => video?.getCodedHeight());
    const rate = await readOptional(() => video?.computeFrameRateMetrics({ targetPacketCount: 96 }));
    return {
      format: container === MP4 ? 'MP4 (MPEG-4)' : container === QTFF ? 'QuickTime (MOV)' : container.name,
      videoCodec,
      audioCodec,
      width,
      height,
      frameRate: rate?.underlyingFrameRate || rate?.averageFrameRate,
      estimatedRate: Boolean(rate && !rate.underlyingFrameRate),
    };
  } finally {
    input.dispose();
  }
}
