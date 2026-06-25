"use strict";
const S_WHATSAPP_NET = '@s.whatsapp.net';
exports.S_WHATSAPP_NET = S_WHATSAPP_NET;
const OFFICIAL_BIZ_JID = '16505361212@c.us';
exports.OFFICIAL_BIZ_JID = OFFICIAL_BIZ_JID;
const SERVER_JID = 'server@c.us';
exports.SERVER_JID = SERVER_JID;
const PSA_WID = '0@c.us';
exports.PSA_WID = PSA_WID;
const STORIES_JID = 'status@broadcast';
exports.STORIES_JID = STORIES_JID;
const META_AI_JID = '13135550002@c.us';
exports.META_AI_JID = META_AI_JID;
var WAJIDDomains;
(function (WAJIDDomains) {
    WAJIDDomains[WAJIDDomains["WHATSAPP"] = 0] = "WHATSAPP";
    WAJIDDomains[WAJIDDomains["LID"] = 1] = "LID";
    WAJIDDomains[WAJIDDomains["HOSTED"] = 128] = "HOSTED";
    WAJIDDomains[WAJIDDomains["HOSTED_LID"] = 129] = "HOSTED_LID";
})(WAJIDDomains || (WAJIDDomains = {}));
exports.WAJIDDomains = WAJIDDomains;
const getServerFromDomainType = (initialServer, domainType) => {
    switch (domainType) {
        case WAJIDDomains.LID:
            return 'lid';
        case WAJIDDomains.HOSTED:
            return 'hosted';
        case WAJIDDomains.HOSTED_LID:
            return 'hosted.lid';
        case WAJIDDomains.WHATSAPP:
        default:
            return initialServer;
    }
};
exports.getServerFromDomainType = getServerFromDomainType;
const jidEncode = (user, server, device, agent) => {
    return `${user || ''}${!!agent ? `_${agent}` : ''}${!!device ? `:${device}` : ''}@${server}`;
};
exports.jidEncode = jidEncode;
const jidDecode = (jid) => {
    // todo: investigate how to implement hosted ids in this case
    const sepIdx = typeof jid === 'string' ? jid.indexOf('@') : -1;
    if (sepIdx < 0) {
        return undefined;
    }
    const server = jid.slice(sepIdx + 1);
    const userCombined = jid.slice(0, sepIdx);
    const [userAgent, device] = userCombined.split(':');
    const [user, agent] = userAgent.split('_');
    let domainType = WAJIDDomains.WHATSAPP;
    if (server === 'lid') {
        domainType = WAJIDDomains.LID;
    }
    else if (server === 'hosted') {
        domainType = WAJIDDomains.HOSTED;
    }
    else if (server === 'hosted.lid') {
        domainType = WAJIDDomains.HOSTED_LID;
    }
    else if (agent) {
        domainType = parseInt(agent);
    }
    return {
        server: server,
        user: user,
        domainType,
        device: device ? +device : undefined
    };
};
exports.jidDecode = jidDecode;
/** is the jid a user */
const areJidsSameUser = (jid1, jid2) => jidDecode(jid1)?.user === jidDecode(jid2)?.user;
exports.areJidsSameUser = areJidsSameUser;
/** is the jid Meta AI */
const isJidMetaAI = (jid) => jid?.endsWith('@bot');
exports.isJidMetaAI = isJidMetaAI;
/** is the jid a PN user */
const isPnUser = (jid) => jid?.endsWith('@s.whatsapp.net');
exports.isPnUser = isPnUser;
/** is the jid a LID */
const isLidUser = (jid) => jid?.endsWith('@lid');
exports.isLidUser = isLidUser;
/** is the jid a broadcast */
const isJidBroadcast = (jid) => jid?.endsWith('@broadcast');
exports.isJidBroadcast = isJidBroadcast;
/** is the jid a group */
const isJidGroup = (jid) => jid?.endsWith('@g.us');
exports.isJidGroup = isJidGroup;
/** is the jid the status broadcast */
const isJidStatusBroadcast = (jid) => jid === 'status@broadcast';
exports.isJidStatusBroadcast = isJidStatusBroadcast;
/** is the jid a newsletter */
const isJidNewsletter = (jid) => jid?.endsWith('@newsletter');
exports.isJidNewsletter = isJidNewsletter;
/** is the jid a hosted PN */
const isHostedPnUser = (jid) => jid?.endsWith('@hosted');
exports.isHostedPnUser = isHostedPnUser;
/** is the jid a hosted LID */
const isHostedLidUser = (jid) => jid?.endsWith('@hosted.lid');
exports.isHostedLidUser = isHostedLidUser;
/** is the jid a interop */
const isInteropUser = (jid) => jid?.endsWith('@interop');
exports.isInteropUser = isInteropUser;
const botRegexp = /^1313555\d{4}$|^131655500\d{2}$/;
const isJidBot = (jid) => jid && botRegexp.test(jid.split('@')[0]) && jid.endsWith('@c.us');
exports.isJidBot = isJidBot;
const jidNormalizedUser = (jid) => {
    const result = jidDecode(jid);
    if (!result) {
        return '';
    }
    const { user, server } = result;
    return jidEncode(user, server === 'c.us' ? 's.whatsapp.net' : server);
};
exports.jidNormalizedUser = jidNormalizedUser;
const transferDevice = (fromJid, toJid) => {
    const fromDecoded = jidDecode(fromJid);
    const deviceId = fromDecoded?.device || 0;
    const { server, user } = jidDecode(toJid);
    return jidEncode(user, server, deviceId);
};
exports.transferDevice = transferDevice;