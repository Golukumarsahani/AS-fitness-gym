
import { useState, type FormEvent } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Star, CheckCircle, MessageSquare } from 'lucide-react';

const GOOGLE_REVIEWS_URL =
  'https://www.google.com/search?q=AS+Fitness+Gym+Google+Reviews';

export default function Review() {
  const [name, setName] = useState('');
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage('');
    setSuccess(false);

    if (!isSupabaseConfigured) {
      setMessage('Review service is not configured yet. Please try again later.');
      return;
    }

    if (name.trim().length < 2 || review.trim().length < 5) {
      setMessage('Please enter your name and a review of at least 5 characters.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from('gym_reviews').insert({
        reviewer_name: name.trim(),
        rating,
        review_text: review.trim(),
        is_approved: false,
      });

      if (error) throw error;

      setSuccess(true);
      setMessage(
        'Thank you! Your review has been submitted for approval.'
      );
      setName('');
      setReview('');
      setRating(5);
    } catch (error) {
      console.error('Review submission failed:', error);
      setMessage('Review could not be submitted. Please try again later.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="section" style={{ maxWidth: 680, margin: '0 auto' }}>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <MessageSquare size={36} />
          <h1>Rate Your Experience</h1>
          <p>AS Fitness Gym values your feedback!</p>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="reviewer-name">Your name</label>
          <input
            id="reviewer-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={80}
            autoComplete="name"
            required
            placeholder="Enter your name"
            style={{ display: 'block', width: '100%', margin: '8px 0 20px' }}
          />

          <p><strong>Your rating</strong></p>
          <div
            role="group"
            aria-label="Choose a rating from 1 to 5 stars"
            style={{ display: 'flex', gap: 8, marginBottom: 20 }}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} star${value > 1 ? 's' : ''}`}
                aria-pressed={rating === value}
                onClick={() => setRating(value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <Star
                  size={32}
                  fill={value <= rating ? '#f5b400' : 'none'}
                  color={value <= rating ? '#f5b400' : '#888'}
                />
              </button>
            ))}
          </div>

          <label htmlFor="review-text">Your review</label>
          <textarea
            id="review-text"
            value={review}
            onChange={(e) => setReview(e.target.value)}
            minLength={5}
            maxLength={1500}
            rows={5}
            required
            placeholder="Tell us about your gym experience..."
            style={{
              display: 'block',
              width: '100%',
              margin: '8px 0 20px',
              boxSizing: 'border-box',
            }}
          />

          <button
            type="submit"
            disabled={loading}
            className="btn btn-red"
            style={{ width: '100%' }}
          >
            {loading ? 'Submitting...' : 'Submit Review'}
          </button>
        </form>

        {message && (
          <p role="status" style={{ marginTop: 16 }}>
            {success && <CheckCircle size={18} />}
            {' '}{message}
          </p>
        )}

        <hr style={{ margin: '24px 0' }} />

        <div style={{ textAlign: 'center' }}>
          <h2>Review us on Google</h2>
          <p>Share your experience on Google too.</p>
          <a
            href={GOOGLE_REVIEWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
          >
            Google Reviews
          </a>
        </div>
      </div>
    </main>
  );
}
