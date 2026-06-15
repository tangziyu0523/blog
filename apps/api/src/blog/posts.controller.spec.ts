import { Test } from '@nestjs/testing';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { LikesService } from './likes.service';
import { ViewCountService } from './view-count.service';

const postsMock = { list: jest.fn() };
const likesMock = {};
const viewMock = { record: jest.fn() };

describe('PostsController', () => {
  let controller: PostsController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [
        { provide: PostsService, useValue: postsMock },
        { provide: LikesService, useValue: likesMock },
        { provide: ViewCountService, useValue: viewMock },
      ],
    }).compile();
    controller = moduleRef.get(PostsController);
  });

  it('list passes sort through to the service', () => {
    postsMock.list.mockReturnValue({ items: [], total: 0, page: 1, pageSize: 10 });
    controller.list(undefined, { sort: 'hot' } as never);
    expect(postsMock.list).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'hot', mine: false }),
    );
  });

  it('view derives an anonymous viewer key from ip+ua and records', async () => {
    const req = { ip: '1.2.3.4', headers: { 'user-agent': 'UA' } } as never;
    await controller.view(undefined, 'post-1', req);
    expect(viewMock.record).toHaveBeenCalledTimes(1);
    const [postId, key] = viewMock.record.mock.calls[0];
    expect(postId).toBe('post-1');
    expect(key.startsWith('a:')).toBe(true);
  });

  it('view uses the userId key when authenticated', async () => {
    const req = { ip: '1.2.3.4', headers: { 'user-agent': 'UA' } } as never;
    await controller.view({ userId: 'u9' }, 'post-1', req);
    const [, key] = viewMock.record.mock.calls[0];
    expect(key).toBe('u:u9');
  });
});
