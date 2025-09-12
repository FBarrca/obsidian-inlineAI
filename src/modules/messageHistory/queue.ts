/**
 * MessageQueue is a generic fixed-length queue for storing recent chat messages.
 * - When a new item is enqueued and the queue is full, the oldest item is removed.
 * - Duplicate consecutive items are not added.
 * - Provides standard queue operations: enqueue, dequeue, peek, size, isEmpty, and getItems.
 */
export class MessageQueue<T> {
	private items: T[] = [];
	private maxLength: number;

	constructor(maxLength: number) {
		this.maxLength = maxLength;
	}

	// Adds an item to the queue
	enqueue(item: T): void {
		// If the new item is exactly the same as the previous one, do not add it
		if (this.items.length > 0) {
			const lastItem = this.items[this.items.length - 1];
			if (lastItem === item) {
				return;
			}
		}
		if (this.items.length >= this.maxLength) {
			// Remove the oldest item if the queue is full
			this.items.shift();
		}
		this.items.push(item);
	}

	// Removes and returns the item at the front of the queue
	dequeue(): T | undefined {
		return this.items.shift();
	}

	// Returns the item at the front of the queue without removing it
	peek(): T | undefined {
		return this.items[0];
	}

	// Returns the current size of the queue
	size(): number {
		return this.items.length;
	}

	// Checks if the queue is empty
	isEmpty(): boolean {
		return this.items.length === 0;
	}

	// Returns the items in the queue
	getItems(): T[] {
		return [...this.items];
	}
}
