## What changed and why

## End-to-end tests

CI no longer runs the end-to-end suite. Run `npm run test:e2e:local` on your machine and paste the line it prints that starts with `End-to-end tests:` here:

```
End-to-end tests: <commit>, <passed> passed, <failed> failed, <total> total, <date>
```

The PR's head must be the commit this line names, so a line that says "with uncommitted changes" does not count. If you push again, run the suite again and update the line.
