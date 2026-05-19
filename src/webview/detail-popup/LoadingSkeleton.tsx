export function LoadingSkeleton() {
	return (
		<div className='flex animate-pulse flex-col gap-4 p-4 h-dvh'>
			<div className='h-40 w-full rounded-2xl bg-gray-200' />
			<div className='h-4 w-3/4 rounded-full bg-gray-200' />
			<div className='h-3 w-1/2 rounded-full bg-gray-200' />
			<div className='mt-2 h-20 w-full rounded-xl bg-gray-200' />
			<div className='h-3 w-full rounded-full bg-gray-200' />
			<div className='h-3 w-5/6 rounded-full bg-gray-200' />
			<div className='mt-2 h-16 w-full rounded-xl bg-gray-200' />
			<div className='h-16 w-full rounded-xl bg-gray-200' />
		</div>
	);
}
