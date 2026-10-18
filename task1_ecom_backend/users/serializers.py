"""
User-facing serializers: registration and "me" profile output.
"""

from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    """
    Registration input serializer.

    Validates:
      - email is unique across all users
      - password is at least 6 characters (minimum_length is set explicitly
        on the validator call so business rules don't depend on AUTH
        PASSWORD_VALIDATORS settings)
      - password2 confirmation matches
    """

    email = serializers.EmailField(
        required=True,
        validators=[UniqueValidator(queryset=User.objects.all(), message="A user with that email already exists.")],
    )
    password = serializers.CharField(write_only=True, min_length=6, style={"input_type": "password"})
    password2 = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ("username", "email", "password", "password2")

    def validate_password(self, value: str) -> str:
        # Spec: minimum length 6. We intentionally do not run Django's full
        # password validators (CommonPasswordValidator etc.) here — the API
        # contract asks only for a 6-char minimum, and stricter checks belong
        # to the frontend signup UX, not silently rejecting valid logins.
        if len(value) < 6:
            raise serializers.ValidationError("Password must be at least 6 characters long.")
        return value

    def validate(self, attrs):
        """Cross-field check: both password fields must match."""
        if attrs["password"] != attrs["password2"]:
            raise serializers.ValidationError({"password2": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        # drop the confirmation field, then hash the password properly.
        validated_data.pop("password2", None)
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserSerializer(serializers.ModelSerializer):
    """Read-only representation of the authenticated user (GET /api/auth/me/)."""

    class Meta:
        model = User
        fields = ("id", "username", "email")
        read_only_fields = ("id", "username", "email")
