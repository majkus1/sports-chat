'use client';

import { useContext, useEffect, useState } from 'react';
import { UserContext, useAuthKey } from '@/context/UserContext';
import CouponsBlock from '@/components/coupons/CouponsBlock';
import { couponContent } from '@/lib/coupons/content';

/**
 * Kupony na „Typach na dziś": serwer renderuje wersję dla gościa (to widzi robot — płatne
 * kupony zakryte), a po załadowaniu pytamy trasę z sesją. Kto ma plan z liczbami, dostaje
 * odkryte 3- i 5-dniowe bez przeładowania — jak plakietki na liście typów.
 */
export default function CouponsLive({ initial, locale, className }) {
	const c = couponContent(locale);
	const { isAuthed } = useContext(UserContext);
	const authKey = useAuthKey();
	const [data, setData] = useState(initial);

	useEffect(() => {
		if (!authKey) return undefined;
		let anulowane = false;
		fetch('/api/coupons', { credentials: 'include', cache: 'no-store' })
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (!anulowane && d?.date) setData(d);
			})
			.catch(() => {});
		return () => {
			anulowane = true;
		};
	}, [authKey]);

	return <CouponsBlock data={data} c={c} locale={locale} guest={!isAuthed} className={className} />;
}
