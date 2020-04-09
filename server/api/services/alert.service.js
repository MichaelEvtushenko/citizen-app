const alertQuery = require('../../data/queries/alert.query');
const approvalQuery = require('../../data/queries/approval.query');
const {convertToMetres} = require('../../helpers/unit.helper');
const {throwInCase, trowInCaseLambda, isLocationValid} = require('../../helpers/validation.helper');
const s3BucketHelper = require('../../helpers/s3-bucket.helper');

// TODO: make anti-spam system
const createAlert = ({userId, description, latitude, longitude}) => {
    return alertQuery.insert({userId, description, latitude, longitude});
};

const approveAlert = async ({userId, alertId, approved}) => {
    const [alertFromDb] = await alertQuery.findByAlertId(alertId);
    throwInCase(!alertFromDb, {message: 'Not found', status: 404});
    const [approvalFromDb] = await approvalQuery.findByAlertIdAndUserId({userId, alertId});
    trowInCaseLambda(approvalFromDb, () => ({
        message: {message: 'Approval already created', approved: approvalFromDb.approved},
        status: 400
    }));
    approved = approved === 'true';
    return approvalQuery.insert({userId, alertId, approved});
};

const findAlertsInRadius = ({latitude, longitude, radius = 30, unit = 'm', limit = 10}) => {
    if (!isLocationValid({latitude, longitude}))
        throw {message: 'Longitude or latitude is not valid', status: 400};
    const alerts = alertQuery.findInRadius({radius: convertToMetres(unit, radius), longitude, latitude, limit});
    return {alerts, radius, unit, limit};
};

const uploadPhotos = async ({files, alertId}) => {
    const links = (await Promise.all(s3BucketHelper.upload(files)))
        .map(res => res.Location);
    return alertQuery.updatePhotoUrls({alertId, photoUrls: links});
};

const findByAlertId = (alertId) => {
    throwInCase(alertId <= 0, {message: `Alert ID is not valid`, status: 400});
    return alertQuery.findByAlertId(alertId);
};

const updateAlertStatus = async (alertId) => {
    try {
        const {rows: [{allCount, approvesCount}]} = await approvalQuery.getStatistics(alertId);
        const ratio = allCount > 1 ? Math.round(100 * (approvesCount / allCount)) : 0;
        if (ratio >= 75) {
            await alertQuery.updateStatus({alertId, status: 'red'});
            console.log(`Alert [ID: ${alertId}] changed status -> 'red'`);
        } else if (ratio >= 50) {
            await alertQuery.updateStatus({alertId, status: 'yellow'});
            console.log(`Alert [ID: ${alertId}] changed status -> 'yellow'`);
        }
    } catch (e) {
        console.error(e);
    }
};

module.exports = {
    createAlert,
    approveAlert,
    findAlertsInRadius,
    uploadPhotos,
    findByAlertId,
    updateAlertStatus,
};
