import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton, CardSkeleton, DashboardSkeleton, ChatSkeleton, TableSkeleton } from './Skeleton';

describe('Skeleton Components', () => {
  describe('Skeleton', () => {
    it('renders without crashing', () => {
      const { container } = render(<Skeleton />);
      expect(container.firstChild).toBeTruthy();
    });

    it('has animate-shimmer CSS class', () => {
      const { container } = render(<Skeleton />);
      const el = container.querySelector('.animate-shimmer');
      expect(el).toBeTruthy();
    });

    it('has rounded CSS class', () => {
      const { container } = render(<Skeleton />);
      const el = container.querySelector('.rounded');
      expect(el).toBeTruthy();
    });

    it('applies custom className', () => {
      const { container } = render(<Skeleton className="w-32 h-8" />);
      const el = container.querySelector('.w-32');
      expect(el).toBeTruthy();
    });

    it('renders multiple skeleton elements when count > 1', () => {
      const { container } = render(<Skeleton count={3} />);
      const elements = container.querySelectorAll('.animate-shimmer');
      expect(elements).toHaveLength(3);
    });

    it('renders a single element by default', () => {
      const { container } = render(<Skeleton />);
      const elements = container.querySelectorAll('.animate-shimmer');
      expect(elements).toHaveLength(1);
    });
  });

  describe('CardSkeleton', () => {
    it('renders without crashing', () => {
      const { container } = render(<CardSkeleton />);
      expect(container.firstChild).toBeTruthy();
    });

    it('contains skeleton elements with animation classes', () => {
      const { container } = render(<CardSkeleton />);
      const skeletons = container.querySelectorAll('.animate-shimmer');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('has proper card styling classes', () => {
      const { container } = render(<CardSkeleton />);
      const card = container.querySelector('.bg-slate-800');
      expect(card).toBeTruthy();
    });
  });

  describe('DashboardSkeleton', () => {
    it('renders without crashing', () => {
      const { container } = render(<DashboardSkeleton />);
      expect(container.firstChild).toBeTruthy();
    });

    it('renders a grid of skeleton cards', () => {
      const { container } = render(<DashboardSkeleton />);
      const skeletons = container.querySelectorAll('.animate-shimmer');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('ChatSkeleton', () => {
    it('renders without crashing', () => {
      const { container } = render(<ChatSkeleton />);
      expect(container.firstChild).toBeTruthy();
    });

    it('contains skeleton elements', () => {
      const { container } = render(<ChatSkeleton />);
      const skeletons = container.querySelectorAll('.animate-shimmer');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('TableSkeleton', () => {
    it('renders without crashing', () => {
      const { container } = render(<TableSkeleton />);
      expect(container.firstChild).toBeTruthy();
    });

    it('renders default 5 rows', () => {
      const { container } = render(<TableSkeleton />);
      const rows = container.querySelectorAll('.divide-y > div');
      expect(rows).toHaveLength(5);
    });

    it('renders custom number of rows', () => {
      const { container } = render(<TableSkeleton rows={3} />);
      const rows = container.querySelectorAll('.divide-y > div');
      expect(rows).toHaveLength(3);
    });
  });
});
