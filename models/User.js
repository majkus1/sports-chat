import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema(
	{
		email: {
			type: String,
			index: true,
			sparse: true,
			unique: true,
			trim: true,
			lowercase: true,
		},
		username: {
			type: String,
			required: true,
			trim: true,
			minlength: 3,
			maxlength: 32,
			unique: true,
		},
		password: { type: String, default: null },
		googleId: { type: String, index: true, sparse: true, unique: true },
		image: { type: String, default: null },

		refreshTokenHash: { type: String, default: null },
		tokenVersion: { type: Number, default: 0 },

		isEmailVerified: { type: Boolean, default: false },
		emailVerificationTokenHash: { type: String, default: null },
		emailVerificationTokenExp: { type: Date, default: null },

		resetPasswordTokenHash: { type: String, default: null },
		resetPasswordTokenExp: { type: Date, default: null },

		// --- Plan i uprawnienia ---
		// Limity przestały być zaszyte w trasach; wynikają z planu przypisanego do konta.
		// Rola zastąpiła porównanie nicku, którym wcześniej włączano konto bez limitów.
		role: { type: String, enum: ['user', 'admin'], default: 'user' },
		plan: { type: String, default: 'free' },
		planStatus: {
			type: String,
			enum: ['active', 'past_due', 'canceled', 'trialing'],
			default: 'active',
		},
		/** null = plan bezterminowy (dotyczy darmowego). */
		planValidUntil: { type: Date, default: null },

		// Wypełniane przez operatora płatności; pusto, dopóki żaden nie jest podpięty.
		billingCustomerId: { type: String, default: null, index: true, sparse: true },
		billingSubscriptionId: { type: String, default: null },

		/** Jednorazowe doładowania ponad limit dzienny (np. z promocji). */
		credits: { type: Number, default: 0 },

		/**
		 * Ślad akceptacji regulaminu: kiedy i której wersji.
		 *
		 * Sama informacja „zaakceptował" nic nie warta — przy sporze liczy się, jaka treść
		 * obowiązywała w tamtym momencie. Konta założone przed wprowadzeniem checkboxa mają
		 * tu `null` i to jest uczciwe: nie było czego akceptować.
		 */
		termsAcceptedAt: { type: Date, default: null },
		termsVersion: { type: String, default: null },
		/** Pojedyncze funkcje przyznane poza planem. */
		grantedFeatures: { type: [String], default: [] },
	},
	{ timestamps: true }
)

export default mongoose.models.User || mongoose.model('User', UserSchema)
