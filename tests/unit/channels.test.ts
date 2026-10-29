import { describe, expect, it } from 'vitest';
import { CHANNELS, channelByKey } from '../../src/lib/channels';
import { joinBase, withBase } from '../../src/lib/url';

describe('channels', () => {
  it('lists the five channels in order', () => {
    expect(CHANNELS.map((c) => `${c.num} ${c.label}`)).toEqual(['1 about', '2 publications', '3 cv', '4 journey', '5 blog']);
    expect(CHANNELS.map((c) => c.path)).toEqual(['/about/', '/publications/', '/cv/', '/journey/', '/blog/']);
  });

  it('gives every channel its fixed summary', () => {
    expect(CHANNELS.map((c) => c.blurb)).toEqual([
      'my background and research interests',
      'an up-to-date list of my research',
      'view and download my cv',
      'my scientific journey in pictures',
      'tutorials, life updates and more!',
    ]);
  });

  it('maps keys 1-5 and rejects everything else', () => {
    expect(channelByKey('3')?.slug).toBe('cv');
    expect(channelByKey('5')?.slug).toBe('blog');
    expect(channelByKey('6')).toBeUndefined();
    expect(channelByKey('0')).toBeUndefined();
    expect(channelByKey('7')).toBeUndefined();
    expect(channelByKey('a')).toBeUndefined();
  });
});

describe('url', () => {
  it('joinBase works for root base', () => {
    expect(joinBase('/', '/cv/')).toBe('/cv/');
    expect(joinBase('/', '/?tv=1')).toBe('/?tv=1');
  });

  it('joinBase works for staging base and normalises slashes', () => {
    expect(joinBase('/new_website/', '/cv/')).toBe('/new_website/cv/');
    expect(joinBase('/new_website', 'cv/')).toBe('/new_website/cv/');
    expect(joinBase('/new_website/', '//cv//x/')).toBe('/new_website/cv/x/');
  });

  it('withBase uses the default base under vitest', () => {
    expect(withBase('/cv/')).toBe('/cv/');
    expect(withBase('//cv//')).toBe('/cv/');
  });
});
