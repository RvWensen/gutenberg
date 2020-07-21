/**
 * WordPress dependencies
 */
import { __ } from '@wordpress/i18n';
import { apiFetch, dispatch, select } from '@wordpress/data-controls';

/**
 * Internal dependencies
 */
import { loadAssets } from './controls';
import getPluginUrl from './utils/get-plugin-url';

/**
 * Returns an action object used in signalling that the downloadable blocks
 * have been requested and is loading.
 *
 * @param {string} filterValue Search string.
 *
 * @return {Object} Action object.
 */
export function fetchDownloadableBlocks( filterValue ) {
	return { type: 'FETCH_DOWNLOADABLE_BLOCKS', filterValue };
}

/**
 * Returns an action object used in signalling that the downloadable blocks
 * have been updated.
 *
 * @param {Array}  downloadableBlocks Downloadable blocks.
 * @param {string} filterValue        Search string.
 *
 * @return {Object} Action object.
 */
export function receiveDownloadableBlocks( downloadableBlocks, filterValue ) {
	return {
		type: 'RECEIVE_DOWNLOADABLE_BLOCKS',
		downloadableBlocks,
		filterValue,
	};
}

/**
 * Action triggered to install a block plugin.
 *
 * @param {Object} block The block item returned by search.
 *
 * @return {boolean} Whether the block was successfully installed & loaded.
 */
export function* installBlockType( block ) {
	const { id, assets } = block;
	let success = false;
	yield clearErrorNotice( id );
	try {
		if ( ! Array.isArray( assets ) || ! assets.length ) {
			throw new Error( __( 'Block has no assets.' ) );
		}
		yield setIsInstalling( block.id, true );

		// If we have a wp:plugin link, the plugin is installed but inactive.
		const url = getPluginUrl( block );
		let links = {};
		if ( url ) {
			yield apiFetch( {
				url,
				data: {
					status: 'active',
				},
				method: 'PUT',
			} );
		} else {
			const response = yield apiFetch( {
				path: 'wp/v2/plugins',
				data: {
					slug: block.id,
					status: 'active',
				},
				method: 'POST',
			} );
			// Add the `self` link for newly-installed blocks.
			links = response._links;
		}

		yield addInstalledBlockType( {
			...block,
			links: { ...block.links, ...links },
		} );

		yield loadAssets( block );
		const registeredBlocks = yield select( 'core/blocks', 'getBlockTypes' );
		if (
			! registeredBlocks.length ||
			! registeredBlocks.filter( ( i ) => i.name === block.name ).length
		) {
			throw new Error(
				__( 'Error registering block. Try reloading the page.' )
			);
		}

		success = true;
	} catch ( error ) {
		let message = error.message || __( 'An error occurred.' );

		// Errors we throw are fatal
		let isFatal = error instanceof Error;

		// Specific API errors that are fatal
		const fatalAPIErrors = {
			folder_exists: __(
				'This block is already installed. Try reloading the page.'
			),
			unable_to_connect_to_filesystem: __(
				'Error installing block. You can reload the page and try again.'
			),
		};

		if ( fatalAPIErrors[ error.code ] ) {
			isFatal = true;
			message = fatalAPIErrors[ error.code ];
		}

		yield setErrorNotice( id, message, isFatal );
	}
	yield setIsInstalling( block.id, false );
	return success;
}

/**
 * Action triggered to uninstall a block plugin.
 *
 * @param {Object} block The blockType object.
 */
export function* uninstallBlockType( block ) {
	try {
		yield apiFetch( {
			url: getPluginUrl( block ),
			data: {
				status: 'inactive',
			},
			method: 'PUT',
		} );
		yield apiFetch( {
			url: getPluginUrl( block ),
			method: 'DELETE',
		} );
		yield removeInstalledBlockType( block );
	} catch ( error ) {
		yield dispatch(
			'core/notices',
			'createErrorNotice',
			error.message || __( 'An error occurred.' )
		);
	}
}

/**
 * Returns an action object used to add a newly installed block type.
 *
 * @param {Object} item The block item with the block id and name.
 *
 * @return {Object} Action object.
 */
export function addInstalledBlockType( item ) {
	return {
		type: 'ADD_INSTALLED_BLOCK_TYPE',
		item,
	};
}

/**
 * Returns an action object used to remove a newly installed block type.
 *
 * @param {string} item The block item with the block id and name.
 *
 * @return {Object} Action object.
 */
export function removeInstalledBlockType( item ) {
	return {
		type: 'REMOVE_INSTALLED_BLOCK_TYPE',
		item,
	};
}

/**
 * Returns an action object used to indicate install in progress
 *
 * @param {string} blockId
 * @param {boolean} isInstalling
 *
 * @return {Object} Action object.
 */
export function setIsInstalling( blockId, isInstalling ) {
	return {
		type: 'SET_INSTALLING_BLOCK',
		blockId,
		isInstalling,
	};
}

/**
 * Sets an error notice string to be displayed to the user
 *
 * @param {string} blockId The ID of the block plugin. eg: my-block
 * @param {string} message  The message shown in the notice.
 * @param {boolean} isFatal Whether the user can recover from the error
 *
 * @return {Object} Action object.
 */
export function setErrorNotice( blockId, message, isFatal = false ) {
	return {
		type: 'SET_ERROR_NOTICE',
		blockId,
		message,
		isFatal,
	};
}

/**
 * Sets the error notice to empty for specific block
 *
 * @param {string} blockId The ID of the block plugin. eg: my-block
 *
 * @return {Object} Action object.
 */
export function clearErrorNotice( blockId ) {
	return {
		type: 'CLEAR_ERROR_NOTICE',
		blockId,
	};
}
