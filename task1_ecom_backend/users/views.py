"""
Auth views: register + me (login uses SimpleJWT's TokenObtainPairView).
"""

from rest_framework import generics, permissions

from .serializers import RegisterSerializer, UserSerializer


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/ — creates a user account."""

    serializer_class = RegisterSerializer
    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)


class MeView(generics.RetrieveAPIView):
    """GET /api/auth/me/ — returns the authenticated user's profile."""

    serializer_class = UserSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_object(self):
        return self.request.user
