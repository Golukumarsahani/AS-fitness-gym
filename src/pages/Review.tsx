
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Star, CheckCircle, MessageSquare, ExternalLink } from 'lucide-react';

const GOOGLE_REVIEWS_URL =
  'https://g.page/r/CcY4wIHAN4peECE/review';

type ReviewItem = {
  id: string;
  reviewer_name: string;
  rating: number;
  review_text: string;
  created_at: string;
};

export default function Review() {
  const [name, setName] = useState('');
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  const loadReviews = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setReviewsLoading(false);
      return;
    }

    setReviewsLoading(true);

    try {
      const { data, error } = await supabase
        .from('gym_reviews')
        .select('id, reviewer_name, rating, review_text, created_at')
        .eq('is_approved', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReviews((data ?? []) as ReviewItem[]);
    } catch (error) {
      console.error('Could not load reviews:', error);
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage('');
    setSuccess(false);

    if (!isSupabaseConfigured) {
      setMessage('Review service is unavailable. Please try again later.');
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
      setMessage('Thank you! Your review has been submitted for approval.');
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
    <main className="section" style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <MessageSquare size={38} />
          <h1>AS Fitness Gym Reviews</h1>
          <p>Share your experience and help others discover our gym.</p>
        </div>

        <div
          style={{
            padding: 22,
            borderRadius: 16,
            textAlign: 'center',
            background: 'rgba(220, 38, 38, 0.07)',
            border: '1px solid rgba(220, 38, 38, 0.25)',
            marginBottom: 32,
          }}
        >
          <Star size={32} color="#f5b400" fill="#f5b400" />
          <h2 style={{ margin: '10px 0' }}>Enjoying your workout?</h2>
          <p>Share your honest experience with us on Google.</p>
          <a
            href={GOOGLE_REVIEWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-red"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '14px 22px',
              borderRadius: 10,
              textDecoration: 'none',
              fontWeight: 700,
              maxWidth: '100%',
              boxSizing: 'border-box',
            }}
          >
            <Star size={19} fill="currentColor" />
            Write a Google Review
            <ExternalLink size={17} />
          </a>
        </div>

        <h2 style={{ textAlign: 'center' }}>Leave a Website Review</h2>
        <p style={{ textAlign: 'center' }}>
          Rate your experience at AS Fitness Gym.
        </p>

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
            style={{
              display: 'block',
              width: '100%',
              boxSizing: 'border-box',
              margin: '8px 0 20px',
            }}
          />

          <p><strong>Your rating</strong></p>
          <div
            role="group"
            aria-label="Choose your star rating"
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
                  border: 0,
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
              boxSizing: 'border-box',
              margin: '8px 0 20px',
            }}
          />

          <button
            type="submit"
            disabled={loading}
            className="btn btn-red"
            style={{ width: '100%' }}
          >
            {loading ? 'Submitting...' : 'Submit My Review'}
          </button>
        </form>

        {message && (
          <p
            role="status"
            style={{
              marginTop: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {success && <CheckCircle size={18} />}
            {message}
          </p>
        )}

        <hr style={{ margin: '32px 0' }} />

        <div>
          <h2 style={{ textAlign: 'center' }}>What Our Members Say</h2>
          <p style={{ textAlign: 'center' }}>
            Reviews shared by our gym members.
          </p>

          {reviewsLoading ? (
            <p style={{ textAlign: 'center' }}>Loading reviews...</p>
          ) : reviews.length === 0 ? (
            <p style={{ textAlign: 'center', padding: 20 }}>
              No published reviews yet. Be the first to share your experience!
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
              {reviews.map((item) => (
                <article
                  key={item.id}
                  className="card"
                  style={{
                    padding: 20,
                    borderRadius: 12,
                    overflowWrap: 'anywhere',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      aria-hidden="true"
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        background: 'rgba(220, 38, 38, 0.12)',
                        fontWeight: 700,
                      }}
                    >
                      {item.reviewer_name.trim().charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <strong>{item.reviewer_name}</strong>
                      <div
                        aria-label={`${item.rating} out of 5 stars`}
                        style={{ display: 'flex', gap: 2 }}
                      >
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={16}
                            fill={star <= item.rating ? '#f5b400' : 'none'}
                            color={star <= item.rating ? '#f5b400' : '#888'}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <p style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>
                    {item.review_text}
                  </p>
                  <small>
                    {new Date(item.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </small>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
