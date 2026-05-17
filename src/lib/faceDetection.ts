import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';

let modelPromise: Promise<blazeface.BlazeFaceModel> | null = null;

export async function getFaceModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      await tf.ready();
      return await blazeface.load();
    })();
  }
  return modelPromise;
}

export async function detectFace(imageElement: HTMLImageElement) {
  const model = await getFaceModel();
  const predictions = await model.estimateFaces(imageElement, false);
  return predictions;
}
