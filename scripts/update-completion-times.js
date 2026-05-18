require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/session');

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return NaN;
  if (p <= 0) return sortedValues[0];
  if (p >= 100) return sortedValues[sortedValues.length - 1];

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function secondsToHHMM(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return 'N/A';
  const clamped = Math.max(0, totalSeconds);
  const wholeSeconds = Math.floor(clamped);
  const totalMinutes = Math.floor(wholeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

async function reportCompletionTimeRange() {
  const uri = process.env.MONGODB_URI;
  const shouldDeleteExtremes = process.argv.includes('--delete-extremes');
  const shouldDeleteBeforeDate = process.argv.includes('--delete-before-20260515');
  const cutoffDateID = '20260515';

  if (!uri) {
    throw new Error('MONGODB_URI not set in .env');
  }

  console.log('Connecting to MongoDB...');

  try {
    await mongoose.connect(uri);
    console.log('MongoDB connection established.');

    const sessions = await Session.find(
      { completionTime: { $ne: null } },
      { uniqueID: 1, completionTime: 1, _id: 0 }
    ).lean();

    if (sessions.length === 0) {
      console.log('No sessions with completionTime were found.');
      return;
    }

    console.log('session values:');
    sessions.forEach((session) => {
      const numericCompletionTime = Number(session.completionTime);
      const converted = Number.isFinite(numericCompletionTime)
        ? secondsToHHMM(numericCompletionTime)
        : 'N/A';
      console.log(
        `- uniqueID: ${session.uniqueID || 'N/A'}, completionTime(raw): ${session.completionTime}, completionTime(HH:MM): ${converted}`
      );
    });

    const completionTimes = sessions
      .map((session) => Number(session.completionTime))
      .filter((value) => Number.isFinite(value));

    if (completionTimes.length === 0) {
      console.log('No numeric completionTime values were found.');
      return;
    }

    const sorted = completionTimes.sort((a, b) => a - b);
    const count = sorted.length;
    const minCompletionTime = sorted[0];
    const maxCompletionTime = sorted[sorted.length - 1];
    const meanCompletionTime = sorted.reduce((sum, value) => sum + value, 0) / count;

    const p10 = percentile(sorted, 10);
    const p25 = percentile(sorted, 25);
    const p50 = percentile(sorted, 50);
    const p75 = percentile(sorted, 75);
    const p90 = percentile(sorted, 90);

    console.log('completionTime summary:');
    console.log(`- count: ${count}`);
    console.log(`- min: ${secondsToHHMM(minCompletionTime)}`);
    console.log(`- max: ${secondsToHHMM(maxCompletionTime)}`);
    console.log(`- mean: ${secondsToHHMM(meanCompletionTime)}`);
    console.log(`- median (p50): ${secondsToHHMM(p50)}`);
    console.log('percentiles:');
    console.log(`- p10: ${secondsToHHMM(p10)}`);
    console.log(`- p25: ${secondsToHHMM(p25)}`);
    console.log(`- p50: ${secondsToHHMM(p50)}`);
    console.log(`- p75: ${secondsToHHMM(p75)}`);
    console.log(`- p90: ${secondsToHHMM(p90)}`);
    console.log('percentile bands (10 deciles, value ranges):');
    for (let start = 0; start < 100; start += 10) {
      const end = start + 10;
      const startValue = start === 0 ? minCompletionTime : percentile(sorted, start);
      const endValue = end === 100 ? maxCompletionTime : percentile(sorted, end);
      console.log(`- p${start}-p${end}: ${secondsToHHMM(startValue)} -> ${secondsToHHMM(endValue)}`);
    }

    const lowerCutoff = p10;
    const upperCutoff = p90;

    if (lowerCutoff >= upperCutoff) {
      console.log('Skipping delete process: p10 is greater than or equal to p90.');
      return;
    }

    const deleteQuery = {
      completionTime: { $type: 'number' },
      $or: [
        { completionTime: { $lte: lowerCutoff } },
        { completionTime: { $gte: upperCutoff } },
      ],
    };

    const deleteCandidateCount = await Session.countDocuments(deleteQuery);

    console.log('extreme-group delete process:');
    console.log(`- lower group (p0-p10) cutoff: <= ${secondsToHHMM(lowerCutoff)}`);
    console.log(`- upper group (p90-p100) cutoff: >= ${secondsToHHMM(upperCutoff)}`);
    console.log(`- records matching delete criteria: ${deleteCandidateCount}`);

    if (!shouldDeleteExtremes) {
      console.log('Dry run only. Re-run with --delete-extremes to actually delete matching records.');
    } else {
      const deleteResult = await Session.deleteMany(deleteQuery);
      console.log(`Deleted records: ${deleteResult.deletedCount}`);
    }

    const sessionsWithIDs = await Session.find(
      { uniqueID: { $exists: true, $ne: null } },
      { _id: 1, uniqueID: 1 }
    ).lean();

    const idsToDeleteByDate = sessionsWithIDs
      .filter((session) => {
        const uniqueID = String(session.uniqueID || '');
        const dateID = uniqueID.slice(0, 8);
        return /^\d{8}$/.test(dateID) && dateID < cutoffDateID;
      })
      .map((session) => session._id);

    console.log('date-id delete process:');
    console.log(`- cutoff date ID: < ${cutoffDateID}`);
    console.log(`- records matching date criteria: ${idsToDeleteByDate.length}`);

    if (!shouldDeleteBeforeDate) {
      console.log('Dry run only. Re-run with --delete-before-20260515 to delete date-matching records.');
    } else if (idsToDeleteByDate.length === 0) {
      console.log('No records matched date-based deletion criteria.');
    } else {
      const dateDeleteResult = await Session.deleteMany({ _id: { $in: idsToDeleteByDate } });
      console.log(`Deleted records by date criteria: ${dateDeleteResult.deletedCount}`);
    }
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
  }
}

reportCompletionTimeRange()
  .then(() => {
    console.log('Done.');
  })
  .catch((err) => {
    console.error('Failed to report completionTime range:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  });