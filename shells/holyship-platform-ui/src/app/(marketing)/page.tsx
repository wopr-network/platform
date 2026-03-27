"use client";

import { FadeIn, Hero, Recognition } from "@/components/landing";

export default function Home() {
	return (
		<>
			<Hero />
			<FadeIn>
				<Recognition />
			</FadeIn>
		</>
	);
}
