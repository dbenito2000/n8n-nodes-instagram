"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.carouselResource = void 0;
const carouselFields = [
    {
        displayName: 'Media Items',
        name: 'mediaItems',
        type: 'fixedCollection',
        typeOptions: {
            multipleValues: true,
            minValue: 2,
            maxValue: 10,
        },
        default: {},
        description: 'The media items (images or videos) to include in the carousel',
        required: true,
        displayOptions: {
            show: {
                resource: ['carousel'],
                operation: ['publish'],
            },
        },
        options: [
            {
                displayName: 'Item',
                name: 'item',
                values: [
                    {
                        displayName: 'Type',
                        name: 'type',
                        type: 'options',
                        options: [
                            {
                                name: 'Image',
                                value: 'IMAGE',
                            },
                            {
                                name: 'Video',
                                value: 'VIDEO',
                            },
                        ],
                        default: 'IMAGE',
                        description: 'The type of media',
                        required: true,
                    },
                    {
                        displayName: 'Image URL',
                        name: 'imageUrl',
                        type: 'string',
                        default: '',
                        description: 'The URL of the image (must be publicly accessible)',
                        displayOptions: {
                            show: {
                                type: ['IMAGE'],
                            },
                        },
                        required: true,
                    },
                    {
                        displayName: 'Video URL',
                        name: 'videoUrl',
                        type: 'string',
                        default: '',
                        description: 'The URL of the video (must be publicly accessible)',
                        displayOptions: {
                            show: {
                                type: ['VIDEO'],
                            },
                        },
                        required: true,
                    },
                ],
            },
        ],
    },
];
exports.carouselResource = {
    value: 'carousel',
    option: {
        name: 'Carousel',
        value: 'carousel',
        description: 'Publish a carousel post with multiple images/videos',
    },
    fields: carouselFields,
    pollIntervalMs: 1500,
    maxPollAttempts: 20,
    publishRetryDelay: 1500,
    publishMaxAttempts: 3,
    buildMediaPayload(itemIndex) {
        return {};
    },
};
//# sourceMappingURL=index.js.map