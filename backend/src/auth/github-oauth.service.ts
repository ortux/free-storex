import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { config } from '../config';
import { userService } from '../users/user.service';
import type { User } from '../lib/models';

export function configurePassport(): void {
  passport.use(
    new GitHubStrategy(
      {
        clientID: config.github.clientId,
        clientSecret: config.github.clientSecret,
        callbackURL: config.github.callbackUrl,
        scope: ['user:email', 'repo'],
      },
      async (
        accessToken: string,
        _refreshToken: string,
        profile: {
          id: string;
          username: string;
          emails?: Array<{ value: string }>;
        },
        done: (err: Error | null, user?: User) => void
      ) => {
        try {
          const user = await userService.findOrCreate({
            id: profile.id,
            username: profile.username,
            email: profile.emails?.[0]?.value ?? null,
            accessToken,
          });
          done(null, user);
        } catch (err) {
          done(err instanceof Error ? err : new Error(String(err)));
        }
      }
    )
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, (user as User).id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await userService.getById(id);
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  });
}
