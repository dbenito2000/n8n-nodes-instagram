"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Instagram = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const resources_1 = require("./resources");
const READY_STATUSES = new Set(['FINISHED', 'PUBLISHED', 'READY']);
const ERROR_STATUSES = new Set(['ERROR', 'FAILED']);
class Instagram {
    constructor() {
        this.description = {
            displayName: 'Instagram',
            name: 'instagram',
            icon: { light: 'file:instagram.svg', dark: 'file:instagram.dark.svg' },
            group: ['transform'],
            version: 1,
            description: 'Publish media to Instagram using Facebook Graph API',
            defaults: {
                name: 'Instagram',
            },
            usableAsTool: true,
            inputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            outputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            credentials: [
                {
                    name: 'instagramApi',
                    required: true,
                },
            ],
            requestDefaults: {
                baseURL: 'https://graph.facebook.com/',
                headers: {
                    accept: 'application/json,text/*;q=0.99',
                },
            },
            properties: [
                {
                    displayName: 'Resource',
                    name: 'resource',
                    type: 'options',
                    noDataExpression: true,
                    options: [...resources_1.instagramResourceOptions],
                    default: '',
                    description: 'Select the Instagram media type to publish',
                    required: true,
                },
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    displayOptions: {
                        show: {
                            resource: ['image', 'reels', 'stories', 'carousel'],
                        },
                    },
                    options: [
                        {
                            name: 'Publish',
                            value: 'publish',
                            action: 'Publish',
                            description: 'Publish media to Instagram',
                        },
                    ],
                    default: 'publish',
                    required: true,
                },
                {
                    displayName: 'Node',
                    name: 'node',
                    type: 'string',
                    default: '',
                    description: 'The Instagram Business Account ID or User ID on which to publish the media',
                    placeholder: 'me',
                    required: true,
                    displayOptions: {
                        show: {
                            resource: ['image', 'reels', 'stories', 'carousel'],
                            operation: ['publish'],
                        },
                    },
                },
                {
                    displayName: 'Graph API Version',
                    name: 'graphApiVersion',
                    type: 'string',
                    default: 'v22.0',
                    description: 'Facebook Graph API version to use when making requests, e.g. v22.0',
                    required: true,
                    displayOptions: {
                        show: {
                            resource: ['image', 'reels', 'stories', 'carousel'],
                            operation: ['publish'],
                        },
                    },
                },
                ...resources_1.instagramResourceFields,
                {
                    displayName: 'Caption',
                    name: 'caption',
                    type: 'string',
                    default: '',
                    description: 'The caption text for the Instagram post',
                    required: true,
                    displayOptions: {
                        show: {
                            resource: ['image', 'reels', 'stories', 'carousel'],
                            operation: ['publish'],
                        },
                    },
                },
            ],
        };
    }
    async execute() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const items = this.getInputData();
        const returnItems = [];
        const waitForContainerReady = async ({ creationId, hostUrl, graphApiVersion, itemIndex, pollIntervalMs, maxPollAttempts, }) => {
            const statusUri = `https://${hostUrl}/${graphApiVersion}/${creationId}`;
            const statusFields = ['status_code', 'status'];
            const pollRequestOptions = {
                headers: {
                    accept: 'application/json,text/*;q=0.99',
                },
                method: 'GET',
                url: statusUri,
                qs: {
                    fields: statusFields.join(','),
                },
                json: true,
            };
            let lastStatus;
            for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
                const statusResponse = (await this.helpers.httpRequestWithAuthentication.call(this, 'instagramApi', pollRequestOptions));
                const statuses = statusFields
                    .map((field) => statusResponse[field])
                    .filter((value) => typeof value === 'string')
                    .map((value) => value.toUpperCase());
                if (statuses.length > 0) {
                    lastStatus = statuses[0];
                }
                if (statuses.some((status) => READY_STATUSES.has(status))) {
                    return;
                }
                if (statuses.some((status) => ERROR_STATUSES.has(status))) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Media container reported error status (${statuses.join(', ')}) while waiting to publish.`, { itemIndex });
                }
                await (0, n8n_workflow_1.sleep)(pollIntervalMs);
            }
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Timed out waiting for container to become ready. Last known status: ${lastStatus !== null && lastStatus !== void 0 ? lastStatus : 'unknown'}.`, { itemIndex });
        };
        const isMediaNotReadyError = (error) => {
            var _a, _b, _c, _d;
            const errorWithGraph = error;
            const graphError = (_b = (_a = errorWithGraph === null || errorWithGraph === void 0 ? void 0 : errorWithGraph.response) === null || _a === void 0 ? void 0 : _a.body) === null || _b === void 0 ? void 0 : _b.error;
            if (!graphError)
                return false;
            const message = (_d = (_c = graphError.message) === null || _c === void 0 ? void 0 : _c.toLowerCase()) !== null && _d !== void 0 ? _d : '';
            const code = graphError.code;
            const subcode = graphError.error_subcode;
            return (message.includes('not ready') ||
                message.includes('not finished') ||
                message.includes('not yet') ||
                code === 900 ||
                subcode === 2207055);
        };
        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            try {
                const resource = this.getNodeParameter('resource', itemIndex);
                const operation = this.getNodeParameter('operation', itemIndex);
                if (operation !== 'publish') {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Unsupported operation: ${operation}`, {
                        itemIndex,
                    });
                }
                const handler = resources_1.instagramResourceHandlers[resource];
                if (!handler) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Unsupported resource: ${resource}`, {
                        itemIndex,
                    });
                }
                const node = this.getNodeParameter('node', itemIndex);
                const graphApiVersion = this.getNodeParameter('graphApiVersion', itemIndex);
                const caption = this.getNodeParameter('caption', itemIndex);
                const hostUrl = 'graph.facebook.com';
                const httpRequestMethod = 'POST';
                let creationId;
                if (resource === 'carousel') {
                    let mediaItemsParam;
                    try {
                        mediaItemsParam = this.getNodeParameter('mediaItems', itemIndex, {});
                    }
                    catch (error) {
                        if (!this.continueOnFail()) {
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Failed to read mediaItems parameter: ${error.message}`, { itemIndex });
                        }
                        returnItems.push({
                            json: { error: `Failed to read mediaItems parameter: ${error.message}` },
                            pairedItem: { item: itemIndex },
                        });
                        continue;
                    }
                    let mediaItemsData = [];
                    if (!mediaItemsParam || (typeof mediaItemsParam !== 'object' && !Array.isArray(mediaItemsParam))) {
                        if (!this.continueOnFail()) {
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Media items parameter is missing or invalid. Please add at least 2 media items to the carousel.', { itemIndex });
                        }
                        returnItems.push({
                            json: { error: 'Media items parameter is missing or invalid' },
                            pairedItem: { item: itemIndex },
                        });
                        continue;
                    }
                    if (Array.isArray(mediaItemsParam)) {
                        mediaItemsData = mediaItemsParam;
                    }
                    else {
                        if (Array.isArray(mediaItemsParam.item)) {
                            mediaItemsData = mediaItemsParam.item;
                        }
                        else if (mediaItemsParam.item && typeof mediaItemsParam.item === 'object' && !Array.isArray(mediaItemsParam.item)) {
                            mediaItemsData = [mediaItemsParam.item];
                        }
                        else if (Array.isArray(mediaItemsParam.values)) {
                            mediaItemsData = mediaItemsParam.values;
                        }
                    }
                    if (!Array.isArray(mediaItemsData) || mediaItemsData.length < 2) {
                        const isEmpty = Object.keys(mediaItemsParam).length === 0;
                        const errorMessage = isEmpty
                            ? 'No media items provided. Please add at least 2 media items (images or videos) to the carousel in the node configuration.'
                            : `Carousel posts require at least 2 media items. Found: ${mediaItemsData.length}. Parameter structure: ${JSON.stringify(mediaItemsParam)}`;
                        if (!this.continueOnFail()) {
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), errorMessage, { itemIndex });
                        }
                        returnItems.push({
                            json: {
                                error: errorMessage,
                                parameterStructure: mediaItemsParam,
                                foundItems: mediaItemsData.length,
                            },
                            pairedItem: { item: itemIndex },
                        });
                        continue;
                    }
                    if (mediaItemsData.length > 10) {
                        if (!this.continueOnFail()) {
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Carousel posts can contain at most 10 media items.', { itemIndex });
                        }
                        returnItems.push({
                            json: { error: 'Carousel posts can contain at most 10 media items' },
                            pairedItem: { item: itemIndex },
                        });
                        continue;
                    }
                    const mediaUri = `https://${hostUrl}/${graphApiVersion}/${node}/media`;
                    const containerIds = [];
                    let carouselCreationFailed = false;
                    for (let i = 0; i < mediaItemsData.length; i++) {
                        const item = mediaItemsData[i];
                        if (!item || typeof item !== 'object') {
                            if (!this.continueOnFail()) {
                                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Media item ${i + 1} is invalid.`, { itemIndex });
                            }
                            returnItems.push({
                                json: { error: `Media item ${i + 1} is invalid` },
                                pairedItem: { item: itemIndex },
                            });
                            carouselCreationFailed = true;
                            break;
                        }
                        const itemPayload = {
                            is_carousel_item: true,
                        };
                        if (item.type === 'IMAGE') {
                            const imageUrl = (_a = item.imageUrl) === null || _a === void 0 ? void 0 : _a.toString().trim();
                            if (!imageUrl) {
                                if (!this.continueOnFail()) {
                                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Media item ${i + 1} is missing imageUrl.`, { itemIndex });
                                }
                                returnItems.push({
                                    json: { error: `Media item ${i + 1} is missing imageUrl` },
                                    pairedItem: { item: itemIndex },
                                });
                                carouselCreationFailed = true;
                                break;
                            }
                            itemPayload.image_url = imageUrl;
                        }
                        else if (item.type === 'VIDEO') {
                            const videoUrl = (_b = item.videoUrl) === null || _b === void 0 ? void 0 : _b.toString().trim();
                            if (!videoUrl) {
                                if (!this.continueOnFail()) {
                                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Media item ${i + 1} is missing videoUrl.`, { itemIndex });
                                }
                                returnItems.push({
                                    json: { error: `Media item ${i + 1} is missing videoUrl` },
                                    pairedItem: { item: itemIndex },
                                });
                                carouselCreationFailed = true;
                                break;
                            }
                            itemPayload.video_url = videoUrl;
                            itemPayload.media_type = 'VIDEO';
                        }
                        else {
                            if (!this.continueOnFail()) {
                                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Media item ${i + 1} has invalid type: ${item.type}. Must be IMAGE or VIDEO.`, { itemIndex });
                            }
                            returnItems.push({
                                json: { error: `Media item ${i + 1} has invalid type: ${item.type}` },
                                pairedItem: { item: itemIndex },
                            });
                            carouselCreationFailed = true;
                            break;
                        }
                        const itemRequestOptions = {
                            headers: {
                                accept: 'application/json,text/*;q=0.99',
                            },
                            method: httpRequestMethod,
                            url: mediaUri,
                            qs: itemPayload,
                            json: true,
                        };
                        let itemResponse;
                        try {
                            itemResponse = await this.helpers.httpRequestWithAuthentication.call(this, 'instagramApi', itemRequestOptions);
                        }
                        catch (error) {
                            if (!this.continueOnFail()) {
                                throw new n8n_workflow_1.NodeApiError(this.getNode(), error, {
                                    message: `Failed to create carousel item ${i + 1}: ${(error === null || error === void 0 ? void 0 : error.message) || 'Unknown error'}`,
                                });
                            }
                            let errorItem;
                            const err = error;
                            if (err.response !== undefined) {
                                const graphApiErrors = (_d = (_c = err.response.body) === null || _c === void 0 ? void 0 : _c.error) !== null && _d !== void 0 ? _d : {};
                                errorItem = {
                                    statusCode: err.statusCode,
                                    message: err.message || (graphApiErrors === null || graphApiErrors === void 0 ? void 0 : graphApiErrors.message) || 'Unknown error',
                                    ...graphApiErrors,
                                    headers: err.response.headers,
                                    itemIndex: i + 1,
                                    payload: itemPayload,
                                };
                            }
                            else {
                                errorItem = {
                                    ...err,
                                    itemIndex: i + 1,
                                    payload: itemPayload,
                                };
                            }
                            returnItems.push({ json: errorItem, pairedItem: { item: itemIndex } });
                            carouselCreationFailed = true;
                            break;
                        }
                        if (typeof itemResponse === 'string') {
                            if (!this.continueOnFail()) {
                                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Media item ${i + 1} creation response body is not valid JSON.`, { itemIndex });
                            }
                            returnItems.push({
                                json: { message: itemResponse, itemIndex: i + 1 },
                                pairedItem: { item: itemIndex },
                            });
                            carouselCreationFailed = true;
                            break;
                        }
                        const itemContainerId = itemResponse.id;
                        if (!itemContainerId) {
                            if (!this.continueOnFail()) {
                                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Media item ${i + 1} creation response did not contain an id.`, { itemIndex });
                            }
                            returnItems.push({
                                json: {
                                    error: `No container id in response for item ${i + 1}`,
                                    response: itemResponse,
                                },
                                pairedItem: { item: itemIndex },
                            });
                            carouselCreationFailed = true;
                            break;
                        }
                        try {
                            await waitForContainerReady({
                                creationId: itemContainerId,
                                hostUrl,
                                graphApiVersion,
                                itemIndex,
                                pollIntervalMs: handler.pollIntervalMs,
                                maxPollAttempts: handler.maxPollAttempts,
                            });
                        }
                        catch (error) {
                            if (!this.continueOnFail()) {
                                throw error;
                            }
                            returnItems.push({
                                json: {
                                    error: `Failed to wait for container ${itemContainerId} to be ready`,
                                    itemIndex: i + 1,
                                    errorDetails: error,
                                },
                                pairedItem: { item: itemIndex },
                            });
                            carouselCreationFailed = true;
                            break;
                        }
                        containerIds.push(itemContainerId);
                    }
                    if (carouselCreationFailed) {
                        continue;
                    }
                    if (containerIds.length === 0) {
                        if (!this.continueOnFail()) {
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'No carousel items were successfully created.', { itemIndex });
                        }
                        returnItems.push({
                            json: { error: 'No carousel items were successfully created' },
                            pairedItem: { item: itemIndex },
                        });
                        continue;
                    }
                    const carouselPayload = {
                        media_type: 'CAROUSEL',
                        children: containerIds.join(','),
                        caption,
                    };
                    const carouselRequestOptions = {
                        headers: {
                            accept: 'application/json,text/*;q=0.99',
                        },
                        method: httpRequestMethod,
                        url: mediaUri,
                        qs: carouselPayload,
                        json: true,
                    };
                    let carouselResponse;
                    try {
                        carouselResponse = await this.helpers.httpRequestWithAuthentication.call(this, 'instagramApi', carouselRequestOptions);
                    }
                    catch (error) {
                        if (!this.continueOnFail()) {
                            throw new n8n_workflow_1.NodeApiError(this.getNode(), error);
                        }
                        let errorItem;
                        const err = error;
                        if (err.response !== undefined) {
                            const graphApiErrors = (_f = (_e = err.response.body) === null || _e === void 0 ? void 0 : _e.error) !== null && _f !== void 0 ? _f : {};
                            errorItem = {
                                statusCode: err.statusCode,
                                ...graphApiErrors,
                                headers: err.response.headers,
                            };
                        }
                        else {
                            errorItem = err;
                        }
                        returnItems.push({ json: errorItem, pairedItem: { item: itemIndex } });
                        continue;
                    }
                    if (typeof carouselResponse === 'string') {
                        if (!this.continueOnFail()) {
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Carousel creation response body is not valid JSON.', { itemIndex });
                        }
                        returnItems.push({ json: { message: carouselResponse }, pairedItem: { item: itemIndex } });
                        continue;
                    }
                    const carouselContainerId = carouselResponse.id;
                    if (!carouselContainerId) {
                        if (!this.continueOnFail()) {
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Carousel creation response did not contain an id (creation_id).', { itemIndex });
                        }
                        returnItems.push({
                            json: { error: 'No creation_id in carousel response', response: carouselResponse },
                            pairedItem: { item: itemIndex },
                        });
                        continue;
                    }
                    creationId = carouselContainerId;
                    await waitForContainerReady({
                        creationId,
                        hostUrl,
                        graphApiVersion,
                        itemIndex,
                        pollIntervalMs: handler.pollIntervalMs,
                        maxPollAttempts: handler.maxPollAttempts,
                    });
                }
                else {
                    const mediaUri = `https://${hostUrl}/${graphApiVersion}/${node}/media`;
                    const mediaPayload = handler.buildMediaPayload.call(this, itemIndex);
                    const mediaQs = {
                        caption,
                        ...mediaPayload,
                    };
                    const mediaRequestOptions = {
                        headers: {
                            accept: 'application/json,text/*;q=0.99',
                        },
                        method: httpRequestMethod,
                        url: mediaUri,
                        qs: mediaQs,
                        json: true,
                    };
                    let mediaResponse;
                    try {
                        mediaResponse = await this.helpers.httpRequestWithAuthentication.call(this, 'instagramApi', mediaRequestOptions);
                    }
                    catch (error) {
                        if (!this.continueOnFail()) {
                            throw new n8n_workflow_1.NodeApiError(this.getNode(), error);
                        }
                        let errorItem;
                        const err = error;
                        if (err.response !== undefined) {
                            const graphApiErrors = (_h = (_g = err.response.body) === null || _g === void 0 ? void 0 : _g.error) !== null && _h !== void 0 ? _h : {};
                            errorItem = {
                                statusCode: err.statusCode,
                                ...graphApiErrors,
                                headers: err.response.headers,
                            };
                        }
                        else {
                            errorItem = err;
                        }
                        returnItems.push({ json: errorItem, pairedItem: { item: itemIndex } });
                        continue;
                    }
                    if (typeof mediaResponse === 'string') {
                        if (!this.continueOnFail()) {
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Media creation response body is not valid JSON.', {
                                itemIndex,
                            });
                        }
                        returnItems.push({ json: { message: mediaResponse }, pairedItem: { item: itemIndex } });
                        continue;
                    }
                    const responseCreationId = mediaResponse.id;
                    if (!responseCreationId) {
                        if (!this.continueOnFail()) {
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Media creation response did not contain an id (creation_id).', { itemIndex });
                        }
                        returnItems.push({ json: { error: 'No creation_id in response', response: mediaResponse }, pairedItem: { item: itemIndex } });
                        continue;
                    }
                    creationId = responseCreationId;
                    await waitForContainerReady({
                        creationId,
                        hostUrl,
                        graphApiVersion,
                        itemIndex,
                        pollIntervalMs: handler.pollIntervalMs,
                        maxPollAttempts: handler.maxPollAttempts,
                    });
                }
                const publishUri = `https://${hostUrl}/${graphApiVersion}/${node}/media_publish`;
                const publishQs = {
                    creation_id: creationId,
                };
                const publishRequestOptions = {
                    headers: {
                        accept: 'application/json,text/*;q=0.99',
                    },
                    method: httpRequestMethod,
                    url: publishUri,
                    qs: publishQs,
                    json: true,
                };
                const publishRetryDelay = handler.publishRetryDelay;
                const publishMaxAttempts = handler.publishMaxAttempts;
                let publishResponse;
                let publishSucceeded = false;
                let publishFailedWithError = false;
                for (let attempt = 1; attempt <= publishMaxAttempts; attempt++) {
                    try {
                        publishResponse = await this.helpers.httpRequestWithAuthentication.call(this, 'instagramApi', publishRequestOptions);
                        publishSucceeded = true;
                        break;
                    }
                    catch (error) {
                        if (isMediaNotReadyError(error) && attempt < publishMaxAttempts) {
                            await (0, n8n_workflow_1.sleep)(publishRetryDelay);
                            continue;
                        }
                        if (!this.continueOnFail()) {
                            throw new n8n_workflow_1.NodeApiError(this.getNode(), error);
                        }
                        let errorItem;
                        const err = error;
                        if (err.response !== undefined) {
                            const graphApiErrors = (_k = (_j = err.response.body) === null || _j === void 0 ? void 0 : _j.error) !== null && _k !== void 0 ? _k : {};
                            errorItem = {
                                statusCode: err.statusCode,
                                ...graphApiErrors,
                                headers: err.response.headers,
                                creation_id: creationId,
                                note: 'Media was created but publishing failed',
                            };
                        }
                        else {
                            errorItem = { ...error, creation_id: creationId, note: 'Media was created but publishing failed' };
                        }
                        returnItems.push({ json: { ...errorItem }, pairedItem: { item: itemIndex } });
                        publishFailedWithError = true;
                        break;
                    }
                }
                if (publishFailedWithError) {
                    continue;
                }
                if (!publishSucceeded || publishResponse === undefined) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Failed to publish media after ${publishMaxAttempts} attempts due to container not being ready.`, { itemIndex });
                }
                if (typeof publishResponse === 'string') {
                    if (!this.continueOnFail()) {
                        throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Media publish response body is not valid JSON.', {
                            itemIndex,
                        });
                    }
                    returnItems.push({ json: { message: publishResponse }, pairedItem: { item: itemIndex } });
                    continue;
                }
                returnItems.push({ json: publishResponse, pairedItem: { item: itemIndex } });
            }
            catch (error) {
                if (!this.continueOnFail()) {
                    throw new n8n_workflow_1.NodeApiError(this.getNode(), error);
                }
                let errorItem;
                const errorWithGraph = error;
                if (errorWithGraph.response !== undefined) {
                    const graphApiErrors = (_m = (_l = errorWithGraph.response.body) === null || _l === void 0 ? void 0 : _l.error) !== null && _m !== void 0 ? _m : {};
                    errorItem = {
                        statusCode: errorWithGraph.statusCode,
                        ...graphApiErrors,
                        headers: errorWithGraph.response.headers,
                    };
                }
                else {
                    errorItem = error;
                }
                returnItems.push({ json: { ...errorItem }, pairedItem: { item: itemIndex } });
            }
        }
        return [returnItems];
    }
}
exports.Instagram = Instagram;
//# sourceMappingURL=Instagram.node.js.map