/* eslint-disable no-console */
import { imagePointToPatientPoint } from '../util/pointProjector.js';
import external from '../externalModules.js';

export async function calculateCancerRisk(imageId, imagePoint) {
  const predictionData = getPredictionData(imageId, imagePoint);

  const response = await fetch('http://192.241.141.88:5000/predict', {
    method: 'POST',
    body: JSON.stringify({
      case: predictionData.name,
      model_name: 'Densenet_T2_ABK_auc_079_nozone',
      zone: '',
      lps: [
        predictionData.lpsCoords.x,
        predictionData.lpsCoords.y,
        predictionData.lpsCoords.z,
      ],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  const cancerRisk = await response.json();

  return cancerRisk;
}

function getPredictionData(imageId, imagePoint) {
  const patientName = external.cornerstone.metaData.get('patient', imageId)
    .name;

  const imagePlane = external.cornerstone.metaData.get(
    'imagePlaneModule',
    imageId
  );

  return {
    lpsCoords: imagePointToPatientPoint(imagePoint, imagePlane),
    name: patientName,
  };
}
