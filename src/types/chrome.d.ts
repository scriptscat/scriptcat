
declare namespace chrome {
	declare namespace clipboard {
		declare function setImageData(
			imageData: ArrayBuffer,
			type: ImageType,
			additionalItems: AdditionalDataItem[],
			callback: function,
		);

		type DataItemType = 'textPlain' | 'textHtml';
		type ImageType = 'png' | 'jpeg';
		declare interface AdditionalDataItem {
			data: string;
			type: DataItemType;
		}
	}
}
