import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';
import {
	instagramResourceFields,
	instagramResourceHandlers,
	instagramResourceOptions,
} from './resources';
import type { InstagramResourceType } from './resources/types';

const READY_STATUSES = new Set(['FINISHED', 'PUBLISHED', 'READY']);
const ERROR_STATUSES = new Set(['ERROR', 'FAILED']);

export class Instagram implements INodeType {
	description: INodeTypeDescription = {
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
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
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
				options: [...instagramResourceOptions],
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
				description:
					'The Instagram Business Account ID or User ID on which to publish the media',
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
			...instagramResourceFields,
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

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnItems: INodeExecutionData[] = [];

		const waitForContainerReady = async ({
			creationId,
			hostUrl,
			graphApiVersion,
			itemIndex,
			pollIntervalMs,
			maxPollAttempts,
		}: {
			creationId: string;
			hostUrl: string;
			graphApiVersion: string;
			itemIndex: number;
			pollIntervalMs: number;
			maxPollAttempts: number;
		}) => {
			const statusUri = `https://${hostUrl}/${graphApiVersion}/${creationId}`;
			const statusFields = ['status_code', 'status'];

			const pollRequestOptions: IHttpRequestOptions = {
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

			let lastStatus: string | undefined;

			for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
				const statusResponse = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'instagramApi',
					pollRequestOptions,
				)) as IDataObject;
				const statuses = statusFields
					.map((field) => statusResponse[field as keyof IDataObject])
					.filter((value): value is string => typeof value === 'string')
					.map((value) => value.toUpperCase());

				if (statuses.length > 0) {
					lastStatus = statuses[0];
				}

				if (statuses.some((status) => READY_STATUSES.has(status))) {
					return;
				}

				if (statuses.some((status) => ERROR_STATUSES.has(status))) {
					throw new NodeOperationError(
						this.getNode(),
						`Media container reported error status (${statuses.join(', ')}) while waiting to publish.`,
						{ itemIndex },
					);
				}

				await sleep(pollIntervalMs);
			}

			throw new NodeOperationError(
				this.getNode(),
				`Timed out waiting for container to become ready. Last known status: ${lastStatus ?? 'unknown'}.`,
				{ itemIndex },
			);
		};

		const isMediaNotReadyError = (error: unknown) => {
			type GraphError = {
				message?: string;
				code?: number;
				error_subcode?: number;
			};
			type ErrorWithGraph = {
				response?: {
					body?: {
						error?: GraphError;
					};
				};
			};
			const errorWithGraph = error as ErrorWithGraph;
			const graphError = errorWithGraph?.response?.body?.error;
			if (!graphError) return false;
			const message = graphError.message?.toLowerCase() ?? '';
			const code = graphError.code;
			const subcode = graphError.error_subcode;
			return (
				message.includes('not ready') ||
				message.includes('not finished') ||
				message.includes('not yet') ||
				code === 900 ||
				subcode === 2207055
			);
		};

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as InstagramResourceType;
				const operation = this.getNodeParameter('operation', itemIndex) as string;

				if (operation !== 'publish') {
					throw new NodeOperationError(this.getNode(), `Unsupported operation: ${operation}`, {
						itemIndex,
					});
				}

				const handler = instagramResourceHandlers[resource];
				if (!handler) {
					throw new NodeOperationError(this.getNode(), `Unsupported resource: ${resource}`, {
						itemIndex,
					});
				}
				const node = this.getNodeParameter('node', itemIndex) as string;
				const graphApiVersion = this.getNodeParameter('graphApiVersion', itemIndex) as string;
				const caption = this.getNodeParameter('caption', itemIndex) as string;

				// Graph host remains static; version is configurable by the user
				const hostUrl = 'graph.facebook.com';
				const httpRequestMethod = 'POST';

				let creationId: string;

				// Handle carousel posts differently
				if (resource === 'carousel') {
					// Get media items - handle different possible structures
					let mediaItemsParam: IDataObject;
					try {
						mediaItemsParam = this.getNodeParameter('mediaItems', itemIndex, {}) as IDataObject;
					} catch (error) {
						if (!this.continueOnFail()) {
							throw new NodeOperationError(
								this.getNode(),
								`Failed to read mediaItems parameter: ${(error as Error).message}`,
								{ itemIndex },
							);
						}
						returnItems.push({
							json: { error: `Failed to read mediaItems parameter: ${(error as Error).message}` },
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					let mediaItemsData: Array<{
						type: string;
						imageUrl?: string;
						videoUrl?: string;
					}> = [];

					// Handle different possible parameter structures
					if (!mediaItemsParam || (typeof mediaItemsParam !== 'object' && !Array.isArray(mediaItemsParam))) {
						if (!this.continueOnFail()) {
							throw new NodeOperationError(
								this.getNode(),
								'Media items parameter is missing or invalid. Please add at least 2 media items to the carousel.',
								{ itemIndex },
							);
						}
						returnItems.push({
							json: { error: 'Media items parameter is missing or invalid' },
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					if (Array.isArray(mediaItemsParam)) {
						mediaItemsData = mediaItemsParam as Array<{
							type: string;
							imageUrl?: string;
							videoUrl?: string;
						}>;
					} else {
						// Try different property names that n8n might use
						if (Array.isArray(mediaItemsParam.item)) {
							mediaItemsData = mediaItemsParam.item as Array<{
								type: string;
								imageUrl?: string;
								videoUrl?: string;
							}>;
						} else if (mediaItemsParam.item && typeof mediaItemsParam.item === 'object' && !Array.isArray(mediaItemsParam.item)) {
							mediaItemsData = [mediaItemsParam.item as {
								type: string;
								imageUrl?: string;
								videoUrl?: string;
							}];
						} else if (Array.isArray(mediaItemsParam.values)) {
							mediaItemsData = mediaItemsParam.values as Array<{
								type: string;
								imageUrl?: string;
								videoUrl?: string;
							}>;
						}
					}

					// Check if we have valid media items
					if (!Array.isArray(mediaItemsData) || mediaItemsData.length < 2) {
						const isEmpty = Object.keys(mediaItemsParam).length === 0;
						const errorMessage = isEmpty
							? 'No media items provided. Please add at least 2 media items (images or videos) to the carousel in the node configuration.'
							: `Carousel posts require at least 2 media items. Found: ${mediaItemsData.length}. Parameter structure: ${JSON.stringify(mediaItemsParam)}`;
						
						if (!this.continueOnFail()) {
							throw new NodeOperationError(
								this.getNode(),
								errorMessage,
								{ itemIndex },
							);
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
							throw new NodeOperationError(
								this.getNode(),
								'Carousel posts can contain at most 10 media items.',
								{ itemIndex },
							);
						}
						returnItems.push({
							json: { error: 'Carousel posts can contain at most 10 media items' },
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					// Step 1: Create individual media containers for each item
					const mediaUri = `https://${hostUrl}/${graphApiVersion}/${node}/media`;
					const containerIds: string[] = [];
					let carouselCreationFailed = false;

					for (let i = 0; i < mediaItemsData.length; i++) {
						const item = mediaItemsData[i];
						
						if (!item || typeof item !== 'object') {
							if (!this.continueOnFail()) {
								throw new NodeOperationError(
									this.getNode(),
									`Media item ${i + 1} is invalid.`,
									{ itemIndex },
								);
							}
							returnItems.push({
								json: { error: `Media item ${i + 1} is invalid` },
								pairedItem: { item: itemIndex },
							});
							carouselCreationFailed = true;
							break;
						}

						const itemPayload: IDataObject = {
							is_carousel_item: true,
						};

						if (item.type === 'IMAGE') {
							const imageUrl = item.imageUrl?.toString().trim();
							if (!imageUrl) {
								if (!this.continueOnFail()) {
									throw new NodeOperationError(
										this.getNode(),
										`Media item ${i + 1} is missing imageUrl.`,
										{ itemIndex },
									);
								}
								returnItems.push({
									json: { error: `Media item ${i + 1} is missing imageUrl` },
									pairedItem: { item: itemIndex },
								});
								carouselCreationFailed = true;
								break;
							}
							itemPayload.image_url = imageUrl;
						} else if (item.type === 'VIDEO') {
							const videoUrl = item.videoUrl?.toString().trim();
							if (!videoUrl) {
								if (!this.continueOnFail()) {
									throw new NodeOperationError(
										this.getNode(),
										`Media item ${i + 1} is missing videoUrl.`,
										{ itemIndex },
									);
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
						} else {
							if (!this.continueOnFail()) {
								throw new NodeOperationError(
									this.getNode(),
									`Media item ${i + 1} has invalid type: ${item.type}. Must be IMAGE or VIDEO.`,
									{ itemIndex },
								);
							}
							returnItems.push({
								json: { error: `Media item ${i + 1} has invalid type: ${item.type}` },
								pairedItem: { item: itemIndex },
							});
							carouselCreationFailed = true;
							break;
						}

						const itemRequestOptions: IHttpRequestOptions = {
							headers: {
								accept: 'application/json,text/*;q=0.99',
							},
							method: httpRequestMethod,
							url: mediaUri,
							qs: itemPayload,
							json: true,
						};

						let itemResponse: IDataObject;
						try {
							itemResponse = await this.helpers.httpRequestWithAuthentication.call(
								this,
								'instagramApi',
								itemRequestOptions,
							);
						} catch (error: unknown) {
							if (!this.continueOnFail()) {
								throw new NodeApiError(this.getNode(), error as JsonObject, {
									message: `Failed to create carousel item ${i + 1}: ${(error as { message?: string })?.message || 'Unknown error'}`,
								});
							}

							let errorItem: Record<string, unknown>;
							type ResponseErrorType = {
								statusCode?: number;
								message?: string;
								response?: {
									body?: {
										error?: {
											[key: string]: unknown;
										};
									};
									headers?: Record<string, unknown>;
								};
							};
							const err = error as ResponseErrorType;
							if (err.response !== undefined) {
								const graphApiErrors = err.response.body?.error ?? {};
								errorItem = {
									statusCode: err.statusCode,
									message: err.message || (graphApiErrors as { message?: string })?.message || 'Unknown error',
									...graphApiErrors,
									headers: err.response.headers,
									itemIndex: i + 1,
									payload: itemPayload,
								};
							} else {
								errorItem = {
									...err,
									itemIndex: i + 1,
									payload: itemPayload,
								};
							}
							returnItems.push({ json: errorItem as IDataObject, pairedItem: { item: itemIndex } });
							carouselCreationFailed = true;
							break;
						}

						if (typeof itemResponse === 'string') {
							if (!this.continueOnFail()) {
								throw new NodeOperationError(
									this.getNode(),
									`Media item ${i + 1} creation response body is not valid JSON.`,
									{ itemIndex },
								);
							}
							returnItems.push({
								json: { message: itemResponse, itemIndex: i + 1 },
								pairedItem: { item: itemIndex },
							});
							carouselCreationFailed = true;
							break;
						}

						const itemContainerId = itemResponse.id as string | undefined;
						if (!itemContainerId) {
							if (!this.continueOnFail()) {
								throw new NodeOperationError(
									this.getNode(),
									`Media item ${i + 1} creation response did not contain an id.`,
									{ itemIndex },
								);
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

						// Wait for each container to be ready
						try {
							await waitForContainerReady({
								creationId: itemContainerId,
								hostUrl,
								graphApiVersion,
								itemIndex,
								pollIntervalMs: handler.pollIntervalMs,
								maxPollAttempts: handler.maxPollAttempts,
							});
						} catch (error) {
							if (!this.continueOnFail()) {
								throw error;
							}
							returnItems.push({
								json: {
									error: `Failed to wait for container ${itemContainerId} to be ready`,
									itemIndex: i + 1,
									errorDetails: error as IDataObject,
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
							throw new NodeOperationError(
								this.getNode(),
								'No carousel items were successfully created.',
								{ itemIndex },
							);
						}
						returnItems.push({
							json: { error: 'No carousel items were successfully created' },
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					// Step 2: Create carousel container
					const carouselPayload: IDataObject = {
						media_type: 'CAROUSEL',
						children: containerIds.join(','),
						caption,
					};

					const carouselRequestOptions: IHttpRequestOptions = {
						headers: {
							accept: 'application/json,text/*;q=0.99',
						},
						method: httpRequestMethod,
						url: mediaUri,
						qs: carouselPayload,
						json: true,
					};

					let carouselResponse: IDataObject;
					try {
						carouselResponse = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'instagramApi',
							carouselRequestOptions,
						);
					} catch (error: unknown) {
						if (!this.continueOnFail()) {
							throw new NodeApiError(this.getNode(), error as JsonObject);
						}

						let errorItem: Record<string, unknown>;
						type ResponseErrorType = {
							statusCode?: number;
							response?: {
								body?: {
									error?: {
										[key: string]: unknown;
									};
								};
								headers?: Record<string, unknown>;
							};
						};
						const err = error as ResponseErrorType;
						if (err.response !== undefined) {
							const graphApiErrors = err.response.body?.error ?? {};
							errorItem = {
								statusCode: err.statusCode,
								...graphApiErrors,
								headers: err.response.headers,
							};
						} else {
							errorItem = err;
						}
						returnItems.push({ json: errorItem as IDataObject, pairedItem: { item: itemIndex } });
						continue;
					}

					if (typeof carouselResponse === 'string') {
						if (!this.continueOnFail()) {
							throw new NodeOperationError(
								this.getNode(),
								'Carousel creation response body is not valid JSON.',
								{ itemIndex },
							);
						}
						returnItems.push({ json: { message: carouselResponse }, pairedItem: { item: itemIndex } });
						continue;
					}

					const carouselContainerId = carouselResponse.id as string | undefined;
					if (!carouselContainerId) {
						if (!this.continueOnFail()) {
							throw new NodeOperationError(
								this.getNode(),
								'Carousel creation response did not contain an id (creation_id).',
								{ itemIndex },
							);
						}
						returnItems.push({
							json: { error: 'No creation_id in carousel response', response: carouselResponse },
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					creationId = carouselContainerId;

					// Wait until the carousel container is ready before publishing
					await waitForContainerReady({
						creationId,
						hostUrl,
						graphApiVersion,
						itemIndex,
						pollIntervalMs: handler.pollIntervalMs,
						maxPollAttempts: handler.maxPollAttempts,
					});
				} else {
					// Standard flow for non-carousel posts
					// First request: Create media container
					const mediaUri = `https://${hostUrl}/${graphApiVersion}/${node}/media`;
					const mediaPayload = handler.buildMediaPayload.call(this, itemIndex);
					const mediaQs: IDataObject = {
						caption,
						...mediaPayload,
					};

					const mediaRequestOptions: IHttpRequestOptions = {
						headers: {
							accept: 'application/json,text/*;q=0.99',
						},
						method: httpRequestMethod,
						url: mediaUri,
						qs: mediaQs,
						json: true,
					};

					let mediaResponse: IDataObject;
					try {
						mediaResponse = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'instagramApi',
							mediaRequestOptions,
						);
					} catch (error: unknown) {
						if (!this.continueOnFail()) {
							throw new NodeApiError(this.getNode(), error as JsonObject);
						}

						let errorItem: Record<string, unknown>;
						type ResponseErrorType = {
							statusCode?: number;
							response?: {
								body?: {
									error?: {
										[key: string]: unknown;
									};
								};
								headers?: Record<string, unknown>;
							};
						};
						const err = error as ResponseErrorType;
						if (err.response !== undefined) {
							const graphApiErrors = err.response.body?.error ?? {};
							errorItem = {
								statusCode: err.statusCode,
								...graphApiErrors,
								headers: err.response.headers,
							};
						} else {
							errorItem = err;
						}
						returnItems.push({ json: errorItem as IDataObject, pairedItem: { item: itemIndex } });
						continue;
					}

					if (typeof mediaResponse === 'string') {
						if (!this.continueOnFail()) {
							throw new NodeOperationError(this.getNode(), 'Media creation response body is not valid JSON.', {
								itemIndex,
							});
						}
						returnItems.push({ json: { message: mediaResponse }, pairedItem: { item: itemIndex } });
						continue;
					}

					// Extract creation_id from first response
					const responseCreationId = mediaResponse.id as string | undefined;
					if (!responseCreationId) {
						if (!this.continueOnFail()) {
							throw new NodeOperationError(
								this.getNode(),
								'Media creation response did not contain an id (creation_id).',
								{ itemIndex },
							);
						}
						returnItems.push({ json: { error: 'No creation_id in response', response: mediaResponse }, pairedItem: { item: itemIndex } });
						continue;
					}

					creationId = responseCreationId;

					// Wait until the container is ready before publishing
					await waitForContainerReady({
						creationId,
						hostUrl,
						graphApiVersion,
						itemIndex,
						pollIntervalMs: handler.pollIntervalMs,
						maxPollAttempts: handler.maxPollAttempts,
					});
				}

				// Second request: Publish media
				const publishUri = `https://${hostUrl}/${graphApiVersion}/${node}/media_publish`;
				const publishQs: IDataObject = {
					creation_id: creationId,
				};

				const publishRequestOptions: IHttpRequestOptions = {
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
				let publishResponse: IDataObject | undefined;
				let publishSucceeded = false;
				let publishFailedWithError = false;

				for (let attempt = 1; attempt <= publishMaxAttempts; attempt++) {
					try {
						publishResponse = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'instagramApi',
							publishRequestOptions,
						);
						publishSucceeded = true;
						break;
					} catch (error) {
						if (isMediaNotReadyError(error) && attempt < publishMaxAttempts) {
							await sleep(publishRetryDelay);
							continue;
						}

						if (!this.continueOnFail()) {
							throw new NodeApiError(this.getNode(), error as JsonObject);
						}

						let errorItem;
						type ErrorWithResponse = {
							response?: {
								body?: {
									error?: IDataObject;
								};
								headers?: IDataObject;
							};
							statusCode?: number;
						};
						const err = error as ErrorWithResponse;
						if (err.response !== undefined) {
							const graphApiErrors = err.response.body?.error ?? {};
							errorItem = {
								statusCode: err.statusCode,
								...graphApiErrors,
								headers: err.response.headers,
								creation_id: creationId,
								note: 'Media was created but publishing failed',
							};
						} else {
							errorItem = { ...(error as object), creation_id: creationId, note: 'Media was created but publishing failed' };
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
					throw new NodeOperationError(
						this.getNode(),
						`Failed to publish media after ${publishMaxAttempts} attempts due to container not being ready.`,
						{ itemIndex },
					);
				}

				if (typeof publishResponse === 'string') {
					if (!this.continueOnFail()) {
						throw new NodeOperationError(this.getNode(), 'Media publish response body is not valid JSON.', {
							itemIndex,
						});
					}
					returnItems.push({ json: { message: publishResponse }, pairedItem: { item: itemIndex } });
					continue;
				}

				// Return the publish response
				returnItems.push({ json: publishResponse, pairedItem: { item: itemIndex } });
			} catch (error) {
				if (!this.continueOnFail()) {
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}

				let errorItem;
				type GraphError = {
					message?: string;
					code?: number;
					error_subcode?: number;
				};
				type ErrorWithGraph = {
					response?: {
						body?: {
							error?: GraphError;
						};
						headers?: IDataObject;
					};
					statusCode?: number;
				};
				const errorWithGraph = error as ErrorWithGraph;
				if (errorWithGraph.response !== undefined) {
					const graphApiErrors = errorWithGraph.response.body?.error ?? {};
					errorItem = {
						statusCode: errorWithGraph.statusCode,
						...graphApiErrors,
						headers: errorWithGraph.response.headers,
					};
				} else {
					errorItem = error as IDataObject;
				}
				returnItems.push({ json: { ...errorItem }, pairedItem: { item: itemIndex } });
			}
		}

		return [returnItems];
	}
}
